-- do.it v2 must-have fields (additive; live DB already has 001_init.sql)
-- Hub applies this in the Supabase SQL editor. Do not rewrite 001.

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

alter table public.tasks
  add column if not exists due_at timestamptz,
  add column if not exists archived_at timestamptz;

create index if not exists tasks_project_archived_idx
  on public.tasks (project_id, archived_at);

create index if not exists tasks_project_due_idx
  on public.tasks (project_id, due_at);

create index if not exists tasks_title_trgm_idx
  on public.tasks using gin (title gin_trgm_ops);

create table if not exists public.task_dependencies (
  blocker_task_id uuid not null references public.tasks (id) on delete cascade,
  blocked_task_id uuid not null references public.tasks (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_task_id, blocked_task_id),
  constraint task_dependencies_no_self check (blocker_task_id <> blocked_task_id)
);

create index if not exists task_dependencies_blocked_idx
  on public.task_dependencies (blocked_task_id);

create or replace function public.enforce_task_dependency_same_project()
returns trigger
language plpgsql
as $$
declare
  blocker_project uuid;
  blocked_project uuid;
begin
  select project_id into blocker_project from public.tasks where id = new.blocker_task_id;
  select project_id into blocked_project from public.tasks where id = new.blocked_task_id;

  if blocker_project is null or blocked_project is null then
    raise exception 'Las tareas de la dependencia no existen';
  end if;

  if blocker_project <> blocked_project then
    raise exception 'Las dependencias deben ser del mismo proyecto';
  end if;

  return new;
end;
$$;

drop trigger if exists task_dependencies_same_project on public.task_dependencies;
create trigger task_dependencies_same_project
before insert or update on public.task_dependencies
for each row
execute function public.enforce_task_dependency_same_project();

create table if not exists public.task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  at timestamptz not null default now(),
  actor text not null,
  action text not null,
  from_value text,
  to_value text,
  meta jsonb,
  constraint task_events_action_chk check (
    action in (
      'status_change',
      'assignee_change',
      'priority_change',
      'archive',
      'create',
      'update',
      'dependency',
      'webhook',
      'override_start'
    )
  )
);

create index if not exists task_events_task_at_idx
  on public.task_events (task_id, at desc);

alter table public.task_dependencies enable row level security;
alter table public.task_events enable row level security;

revoke all on table public.task_dependencies from anon, authenticated;
revoke all on table public.task_events from anon, authenticated;
