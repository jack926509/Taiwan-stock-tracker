-- Cloudflare 排程租約狀態。
-- 僅後端 service_role 可透過 RPC 取得或完成租約；不開放前端角色存取。

create table if not exists public.scheduled_job_state (
  job_name text,
  run_id uuid,
  lease_until timestamptz,
  last_started_at timestamptz,
  last_finished_at timestamptz,
  last_status text check (last_status in ('running', 'ok', 'error')),
  last_detail jsonb not null default '{}'::jsonb,
  primary key (job_name)
);

alter table public.scheduled_job_state enable row level security;

revoke all on table public.scheduled_job_state from public, anon, authenticated;
grant all on table public.scheduled_job_state to service_role;

create or replace function public.claim_scheduled_job(
  p_job_name text,
  p_run_id uuid,
  p_lease_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  changed integer;
begin
  if p_lease_seconds <= 0 then
    raise exception using
      errcode = '22023',
      message = 'p_lease_seconds must be greater than zero';
  end if;

  insert into public.scheduled_job_state (
    job_name,
    run_id,
    lease_until,
    last_started_at,
    last_status,
    last_detail
  )
  values (
    p_job_name,
    p_run_id,
    now() + pg_catalog.make_interval(secs => p_lease_seconds),
    now(),
    'running',
    '{}'::jsonb
  )
  on conflict (job_name) do update
  set run_id = excluded.run_id,
      lease_until = excluded.lease_until,
      last_started_at = excluded.last_started_at,
      last_status = excluded.last_status,
      last_detail = excluded.last_detail
  where public.scheduled_job_state.lease_until <= now()
     or public.scheduled_job_state.lease_until is null;

  get diagnostics changed = row_count;
  return changed > 0;
end;
$$;

create or replace function public.finish_scheduled_job(
  p_job_name text,
  p_run_id uuid,
  p_status text,
  p_detail jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('ok', 'error') then
    raise exception using
      errcode = '22023',
      message = 'p_status must be ok or error';
  end if;

  update public.scheduled_job_state
  set lease_until = null,
      last_finished_at = now(),
      last_status = p_status,
      last_detail = coalesce(p_detail, '{}'::jsonb)
  where job_name = p_job_name
    and run_id = p_run_id;
end;
$$;

revoke execute on function public.claim_scheduled_job(text, uuid, integer)
  from public, anon, authenticated;
revoke execute on function public.finish_scheduled_job(text, uuid, text, jsonb)
  from public, anon, authenticated;

grant execute on function public.claim_scheduled_job(text, uuid, integer)
  to service_role;
grant execute on function public.finish_scheduled_job(text, uuid, text, jsonb)
  to service_role;
