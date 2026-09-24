-- Aggregates and indexes for home counts + bots work view.
-- Hub/Octavi must apply this on bxvhabbuxwsdwpfeklfc. Additive; safe to re-run.

create or replace function public.active_task_status_counts()
returns table(project_id uuid, status public.task_status, n bigint)
language sql
stable
as $$
  select t.project_id, t.status, count(*)::bigint as n
  from public.tasks t
  where t.archived_at is null
  group by t.project_id, t.status;
$$;

revoke all on function public.active_task_status_counts() from public, anon, authenticated;

create index if not exists tasks_doing_bot_started_idx
  on public.tasks (bot_id, started_at)
  where assignee_type = 'bot' and status = 'doing' and archived_at is null;
