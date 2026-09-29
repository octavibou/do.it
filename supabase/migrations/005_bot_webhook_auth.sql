-- Per-bot webhook sender key, configurable auth header, and delivery log.
-- Additive and idempotent. Apply by hand in the Supabase SQL editor after merge.
-- The app degrades if this is not applied yet (no secret, no last-delivery UI).

alter table public.bots
  add column if not exists webhook_secret text,
  add column if not exists webhook_secret_last4 text,
  add column if not exists webhook_header_name text not null default 'Authorization',
  add column if not exists last_webhook_at timestamptz,
  add column if not exists last_webhook_event text,
  add column if not exists last_webhook_task_id uuid,
  add column if not exists last_webhook_status integer,
  add column if not exists last_webhook_error text;

create table if not exists public.webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.bots (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete set null,
  event text not null,
  event_id uuid not null,
  http_status integer,
  error text,
  sent_at timestamptz not null default now()
);

create index if not exists webhook_deliveries_bot_sent_idx
  on public.webhook_deliveries (bot_id, sent_at desc);

alter table public.webhook_deliveries enable row level security;

revoke all on table public.webhook_deliveries from anon, authenticated;
