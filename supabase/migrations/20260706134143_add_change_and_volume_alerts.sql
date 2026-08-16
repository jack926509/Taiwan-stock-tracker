alter table public.watchlist
  add column if not exists alert_change_pct numeric,
  add column if not exists alert_change_hit_at timestamptz,
  add column if not exists alert_volume_on boolean not null default false,
  add column if not exists alert_volume_hit_at timestamptz;
