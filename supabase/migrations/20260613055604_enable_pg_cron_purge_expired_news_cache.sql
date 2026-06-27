create extension if not exists pg_cron with schema extensions;

do $$
begin
  perform cron.unschedule(jobid)
  from cron.job
  where jobname = 'purge-expired-news-cache';

  perform cron.schedule(
    'purge-expired-news-cache',
    '0 * * * *',
    $cron$
      delete from public.news_cache
      where expires_at < now()
        and cache_key not like 'meta:%';
    $cron$
  );
exception
  when undefined_function or insufficient_privilege then
    raise notice 'pg_cron purge job was not scheduled in this environment';
end;
$$;

