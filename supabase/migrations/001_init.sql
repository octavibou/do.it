-- do.it MVP schema + seed
-- Hub applies this to the existing Supabase project.
-- Access model: RLS on, no client policies. Route Handlers / Server Actions
-- use the service role key (bypasses RLS). Anon key is not enough to read data.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'task_status') then
    create type public.task_status as enum ('inbox', 'doing', 'review', 'done');
  end if;
  if not exists (select 1 from pg_type where typname = 'assignee_type') then
    create type public.assignee_type as enum ('human', 'bot');
  end if;
  if not exists (select 1 from pg_type where typname = 'task_priority') then
    create type public.task_priority as enum ('low', 'medium', 'high', 'urgent');
  end if;
end $$;

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.bots (
  id uuid primary key,
  name text not null,
  project_id uuid not null references public.projects (id) on delete cascade,
  webhook_url text,
  created_at timestamptz not null default now()
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null,
  description text,
  status public.task_status not null default 'inbox',
  assignee_type public.assignee_type not null default 'human',
  bot_id uuid references public.bots (id) on delete set null,
  priority public.task_priority,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  webhook_error text,
  webhook_fired_at timestamptz,
  constraint tasks_bot_assignee_chk check (
    (assignee_type = 'human' and bot_id is null)
    or (assignee_type = 'bot' and bot_id is not null)
  )
);

create index if not exists tasks_project_status_idx on public.tasks (project_id, status);
create index if not exists tasks_bot_status_idx on public.tasks (bot_id, status);
create index if not exists bots_project_id_idx on public.bots (project_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists tasks_set_updated_at on public.tasks;
create trigger tasks_set_updated_at
before update on public.tasks
for each row
execute function public.set_updated_at();

alter table public.projects enable row level security;
alter table public.bots enable row level security;
alter table public.tasks enable row level security;

revoke all on table public.projects from anon, authenticated;
revoke all on table public.bots from anon, authenticated;
revoke all on table public.tasks from anon, authenticated;

-- Seed: four projects + their Grok bots (fixed ids).
insert into public.projects (id, slug, name) values
  ('1e8c0d2a-9f3b-4a71-8c2e-5d6f7a8b9c01', 'leadflow', 'Leadflow'),
  ('2f9d1e3b-0a4c-4b82-9d3f-6e7f8a9b0c12', 'personal', 'Personal'),
  ('3a0e2f4c-1b5d-4c93-ae40-7f8a9b0c1d23', 'monetiza', 'Monetiza'),
  ('4b1f3a5d-2c6e-4d04-bf51-8a9b0c1d2e34', 'diselo', 'Diselo')
on conflict (slug) do update
  set name = excluded.name;

insert into public.bots (id, name, project_id, webhook_url) values
  ('7d765d6a-63aa-4d4d-9914-0b3d26dee739', 'Flow', '1e8c0d2a-9f3b-4a71-8c2e-5d6f7a8b9c01', null),
  ('728f5795-a9b8-4253-8ffd-4dbd25f57a0c', 'Home', '2f9d1e3b-0a4c-4b82-9d3f-6e7f8a9b0c12', null),
  ('776da315-252f-4d4e-855f-a0c17be05120', 'Mint', '3a0e2f4c-1b5d-4c93-ae40-7f8a9b0c1d23', null),
  ('64a98027-a9f3-4c87-afe6-51ae8e7512e5', 'Dial', '4b1f3a5d-2c6e-4d04-bf51-8a9b0c1d2e34', null)
on conflict (id) do update
  set name = excluded.name,
      project_id = excluded.project_id;

-- Sample tasks so the board is usable on first open.
insert into public.tasks (
  id, project_id, title, description, status, assignee_type, bot_id, priority
) values
  (
    '10a00000-0000-4000-8000-000000000001',
    '1e8c0d2a-9f3b-4a71-8c2e-5d6f7a8b9c01',
    'Revisar leads de la semana',
    'Filtrar los que merecen follow-up manual.',
    'inbox',
    'human',
    null,
    'high'
  ),
  (
    '10a00000-0000-4000-8000-000000000002',
    '1e8c0d2a-9f3b-4a71-8c2e-5d6f7a8b9c01',
    'Sincronizar CRM',
    'Cuando tenga webhook, Flow lo ejecuta al pasar a En curso.',
    'inbox',
    'bot',
    '7d765d6a-63aa-4d4d-9914-0b3d26dee739',
    'medium'
  ),
  (
    '10a00000-0000-4000-8000-000000000003',
    '2f9d1e3b-0a4c-4b82-9d3f-6e7f8a9b0c12',
    'Comprar café',
    null,
    'inbox',
    'human',
    null,
    'low'
  ),
  (
    '10a00000-0000-4000-8000-000000000004',
    '3a0e2f4c-1b5d-4c93-ae40-7f8a9b0c1d23',
    'Borrador newsletter',
    'Revisión humana del texto de Mint.',
    'review',
    'human',
    null,
    'medium'
  ),
  (
    '10a00000-0000-4000-8000-000000000005',
    '4b1f3a5d-2c6e-4d04-bf51-8a9b0c1d2e34',
    'Moodboard landing',
    'Dial prepara referencias visuales.',
    'inbox',
    'bot',
    '64a98027-a9f3-4c87-afe6-51ae8e7512e5',
    'medium'
  )
on conflict (id) do nothing;
