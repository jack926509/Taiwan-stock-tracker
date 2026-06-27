create table if not exists public.assistant_conversations (
  id uuid primary key default gen_random_uuid(),
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.assistant_messages (
  id bigint generated always as identity primary key,
  conversation_id uuid not null references public.assistant_conversations(id) on delete cascade,
  role text not null check (role in ('system', 'user', 'assistant', 'tool')),
  content text,
  created_at timestamptz not null default now()
);

create index if not exists idx_assistant_messages_conversation
  on public.assistant_messages (conversation_id, created_at);

create table if not exists public.news_articles (
  id bigint generated always as identity primary key,
  title text not null,
  url text not null unique,
  source text,
  source_name text,
  channel text,
  summary text,
  tags jsonb,
  published_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_news_articles_channel_published
  on public.news_articles (channel, published_at desc);

alter table public.assistant_conversations enable row level security;
alter table public.assistant_messages enable row level security;
alter table public.news_articles enable row level security;

revoke all on table public.assistant_conversations from anon, authenticated;
revoke all on table public.assistant_messages from anon, authenticated;
revoke all on table public.news_articles from anon, authenticated;

grant all on table public.assistant_conversations to service_role;
grant all on table public.assistant_messages to service_role;
grant all on table public.news_articles to service_role;
