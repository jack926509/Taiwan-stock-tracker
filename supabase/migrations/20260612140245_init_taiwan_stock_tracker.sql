-- Core Taiwan stock tracker schema.
-- Access model: backend-only Supabase access through SUPABASE_SERVICE_ROLE_KEY.
-- RLS is enabled as defense in depth; no anon/authenticated policies are created.

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.watchlist (
  stock_id text primary key,
  market text not null,
  name text not null,
  group_name text default '預設',
  alert_high numeric,
  alert_low numeric,
  sort_order integer default 0,
  created_at timestamptz default now()
);

create table if not exists public.daily_kline (
  stock_id text not null,
  date date not null,
  open numeric,
  high numeric,
  low numeric,
  close numeric,
  volume bigint,
  primary key (stock_id, date)
);

create table if not exists public.news_cache (
  cache_key text primary key,
  payload jsonb not null,
  fetched_at timestamptz default now(),
  expires_at timestamptz not null
);

create table if not exists public.mis_session (
  id integer primary key default 1 check (id = 1),
  cookie text not null,
  fetched_at timestamptz default now()
);

alter table public.watchlist enable row level security;
alter table public.daily_kline enable row level security;
alter table public.news_cache enable row level security;
alter table public.mis_session enable row level security;

revoke all on table public.watchlist from anon, authenticated;
revoke all on table public.daily_kline from anon, authenticated;
revoke all on table public.news_cache from anon, authenticated;
revoke all on table public.mis_session from anon, authenticated;

grant usage on schema public to service_role;
grant all on table public.watchlist to service_role;
grant all on table public.daily_kline to service_role;
grant all on table public.news_cache to service_role;
grant all on table public.mis_session to service_role;

