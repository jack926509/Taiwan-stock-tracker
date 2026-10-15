-- 個人提醒事件：事件與 hit 同一交易保存，通知結果另行追蹤。
-- 僅新增欄位與函式；不刪除既有設定與快取。正式套用需另取得授權。
alter table public.watchlist add column if not exists alert_versions jsonb not null
  default jsonb_build_object('high',gen_random_uuid()::text,'low',gen_random_uuid()::text,
    'change',gen_random_uuid()::text,'volume',gen_random_uuid()::text);

create or replace function public.preserve_alert_versions() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
declare versions jsonb := old.alert_versions || new.alert_versions;
begin
  if new.alert_high is distinct from old.alert_high or
      (old.alert_high_hit_at is not null and new.alert_high_hit_at is null) then
    versions := jsonb_set(versions,'{high}',to_jsonb(gen_random_uuid()::text));
  end if;
  if new.alert_low is distinct from old.alert_low or
      (old.alert_low_hit_at is not null and new.alert_low_hit_at is null) then
    versions := jsonb_set(versions,'{low}',to_jsonb(gen_random_uuid()::text));
  end if;
  if new.alert_change_pct is distinct from old.alert_change_pct or
      (old.alert_change_hit_at is not null and new.alert_change_hit_at is null) then
    versions := jsonb_set(versions,'{change}',to_jsonb(gen_random_uuid()::text));
  end if;
  if new.alert_volume_on is distinct from old.alert_volume_on or
      (old.alert_volume_hit_at is not null and new.alert_volume_hit_at is null) then
    versions := jsonb_set(versions,'{volume}',to_jsonb(gen_random_uuid()::text));
  end if;
  new.alert_versions := versions;
  return new;
end $$;
create trigger preserve_alert_versions before update on public.watchlist
for each row execute function public.preserve_alert_versions();

create or replace function public.capture_alert_event(
  p_stock_id text, p_kind text, p_version text, p_triggered_at timestamptz,
  p_quote_as_of timestamptz, p_price numeric, p_threshold numeric,
  p_change_pct numeric, p_volume numeric
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  item public.watchlist%rowtype;
  hit_at timestamptz;
  slot text;
  event_key text;
  event_id text := gen_random_uuid()::text;
  event jsonb;
begin
  if p_kind not in ('high','low','change','volume') or p_triggered_at is null or
    p_quote_as_of is null or p_quote_as_of > p_triggered_at or
    p_triggered_at - p_quote_as_of > interval '120 seconds' or
    (p_triggered_at at time zone 'Asia/Taipei')::date <> (p_quote_as_of at time zone 'Asia/Taipei')::date or
    p_price is null or p_price <= 0 or p_price::text in ('NaN','Infinity','-Infinity') or
    p_threshold is null or p_threshold <= 0 or p_threshold::text in ('NaN','Infinity','-Infinity') then
    return null;
  end if;
  select * into item from public.watchlist where stock_id=p_stock_id for update;
  if not found or coalesce(item.alert_versions->>p_kind,'initial') is distinct from p_version then return null; end if;
  case p_kind
    when 'high' then
      if item.alert_high is distinct from p_threshold or p_price < p_threshold then return null; end if;
      hit_at := item.alert_high_hit_at;
    when 'low' then
      if item.alert_low is distinct from p_threshold or p_price > p_threshold then return null; end if;
      hit_at := item.alert_low_hit_at;
    when 'change' then
      if item.alert_change_pct is distinct from p_threshold or p_change_pct is null or
        p_change_pct::text in ('NaN','Infinity','-Infinity') or abs(p_change_pct*100) < p_threshold then return null; end if;
      hit_at := item.alert_change_hit_at;
    when 'volume' then
      if not item.alert_volume_on or p_volume is null or p_volume::text in ('NaN','Infinity','-Infinity') or
        p_volume < 2*p_threshold then return null; end if;
      hit_at := item.alert_volume_hit_at;
  end case;
  if hit_at is not null and (p_kind in ('high','low') or
    (hit_at at time zone 'Asia/Taipei')::date=(p_triggered_at at time zone 'Asia/Taipei')::date) then return null; end if;
  slot := case when p_kind in ('high','low') then 'once'
    else to_char(p_triggered_at at time zone 'Asia/Taipei','YYYY-MM-DD') end;
  event_key := 'alert:event:'||p_stock_id||':'||p_kind||':'||p_version||':'||slot;
  event := jsonb_build_object('v',1,'id',event_id,'key',event_key,'stockId',item.stock_id,
    'market',item.market,'name',item.name,'kind',p_kind,'threshold',p_threshold,'price',p_price,
    'changePct',p_change_pct,'volume',p_volume,'triggeredAt',p_triggered_at,'quoteAsOf',p_quote_as_of,
    'notification',jsonb_build_object('state','pending','attempts',0,'retryKey',event_id));
  insert into public.news_cache(cache_key,payload,fetched_at,expires_at)
    values(event_key,event,p_triggered_at,'2099-12-31T00:00:00Z') on conflict do nothing;
  if not found then return null; end if;
  update public.watchlist set
    alert_high_hit_at=case when p_kind='high' then p_triggered_at else alert_high_hit_at end,
    alert_low_hit_at=case when p_kind='low' then p_triggered_at else alert_low_hit_at end,
    alert_change_hit_at=case when p_kind='change' then p_triggered_at else alert_change_hit_at end,
    alert_volume_hit_at=case when p_kind='volume' then p_triggered_at else alert_volume_hit_at end
    where stock_id=p_stock_id;
  return event;
end $$;

create or replace function public.claim_alert_delivery(p_key text,p_claim_id text,p_now timestamptz)
returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare event jsonb; notification jsonb; attempts integer;
begin
  if p_key not like 'alert:event:%' then return null; end if;
  select payload into event from public.news_cache where cache_key=p_key for update;
  if not found then return null; end if;
  notification := event->'notification';
  if notification->>'state' not in ('pending','retry','sending') then return null; end if;
  if notification->>'state'='sending' and (notification->>'leaseUntil')::timestamptz > p_now then return null; end if;
  if (notification->>'nextAttemptAt')::timestamptz > p_now then return null; end if;
  attempts := (notification->>'attempts')::integer;
  if p_now-(event->>'triggeredAt')::timestamptz > interval '15 minutes' or attempts >= 3 then
    notification := notification || jsonb_build_object('state','failed','reason','retry-expired');
    update public.news_cache set payload=jsonb_set(event,'{notification}',notification) where cache_key=p_key;
    return null;
  end if;
  notification := notification || jsonb_build_object('state','sending','attempts',attempts+1,
    'claimId',p_claim_id,'attemptedAt',p_now,'leaseUntil',p_now+interval '60 seconds');
  event := jsonb_set(event,'{notification}',notification);
  update public.news_cache set payload=event where cache_key=p_key;
  return event;
end $$;

create or replace function public.finish_alert_delivery(
  p_key text,p_claim_id text,p_state text,p_reason text,p_retryable boolean,p_now timestamptz
) returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare event jsonb; notification jsonb; state text;
begin
  if p_key not like 'alert:event:%' or p_state not in ('accepted','unconfigured','limited','failed') then return false; end if;
  select payload into event from public.news_cache where cache_key=p_key for update;
  if not found then return false; end if;
  notification := event->'notification';
  if notification->>'claimId' is distinct from p_claim_id or notification->>'state'<>'sending' then return false; end if;
  state := case when p_state='failed' and p_retryable and (notification->>'attempts')::integer < 3
    then 'retry' else p_state end;
  notification := notification || jsonb_build_object('state',state,
    'reason',case when p_reason ~ '^(not-configured|daily-limit|network|usage-unavailable|http-[45][0-9]{2})$' then p_reason else null end,'finishedAt',p_now,
    'nextAttemptAt',p_now+case when (notification->>'attempts')::integer=1 then interval '1 minute' else interval '5 minutes' end);
  update public.news_cache set payload=jsonb_set(event,'{notification}',notification) where cache_key=p_key;
  return true;
end $$;

create or replace function public.reserve_line_quota(p_retry_key uuid,p_now timestamptz,p_daily_cap integer)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
declare usage jsonb; day text; month text; reservation text := 'meta:line-reservation:'||p_retry_key::text;
begin
  if p_retry_key is null or p_now is null or p_daily_cap < 1 or p_daily_cap > 15 then return false; end if;
  day := to_char(p_now at time zone 'Asia/Taipei','YYYY-MM-DD');
  month := left(day,7);
  insert into public.news_cache(cache_key,payload,fetched_at,expires_at)
    values('meta:line-usage','{}',p_now,'2099-12-31T00:00:00Z') on conflict do nothing;
  select payload into usage from public.news_cache where cache_key='meta:line-usage' for update;
  -- 用量列鎖定後再查，兩個同時的相同識別也只保留一次。
  if exists(select 1 from public.news_cache where cache_key=reservation and expires_at>p_now) then return true; end if;
  if usage->>'month' is distinct from month then
    usage := jsonb_build_object('month',month,'count',0,'day',day,'dayCount',0);
  elsif usage->>'day' is distinct from day then
    usage := usage || jsonb_build_object('day',day,'dayCount',0);
  end if;
  if (usage->>'dayCount')::integer >= p_daily_cap then return false; end if;
  usage := usage || jsonb_build_object('count',(usage->>'count')::integer+1,'dayCount',(usage->>'dayCount')::integer+1);
  update public.news_cache set payload=usage,fetched_at=p_now where cache_key='meta:line-usage';
  insert into public.news_cache(cache_key,payload,fetched_at,expires_at)
    values(reservation,'{}',p_now,p_now+interval '24 hours')
    on conflict(cache_key) do update set fetched_at=excluded.fetched_at,expires_at=excluded.expires_at;
  return true;
end $$;

revoke all on function public.preserve_alert_versions() from public,anon,authenticated;
revoke all on function public.capture_alert_event(text,text,text,timestamptz,timestamptz,numeric,numeric,numeric,numeric) from public,anon,authenticated;
revoke all on function public.claim_alert_delivery(text,text,timestamptz) from public,anon,authenticated;
revoke all on function public.finish_alert_delivery(text,text,text,text,boolean,timestamptz) from public,anon,authenticated;
grant execute on function public.preserve_alert_versions() to service_role;
grant execute on function public.capture_alert_event(text,text,text,timestamptz,timestamptz,numeric,numeric,numeric,numeric) to service_role;
grant execute on function public.claim_alert_delivery(text,text,timestamptz) to service_role;
grant execute on function public.finish_alert_delivery(text,text,text,text,boolean,timestamptz) to service_role;
revoke all on function public.reserve_line_quota(uuid,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.reserve_line_quota(uuid,timestamptz,integer) to service_role;
