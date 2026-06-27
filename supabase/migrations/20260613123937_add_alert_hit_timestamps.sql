alter table public.watchlist
  add column if not exists alert_high_hit_at timestamptz,
  add column if not exists alert_low_hit_at timestamptz;

