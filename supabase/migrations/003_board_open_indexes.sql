-- Indexes for the project-open path (Hub/Octavi must apply this on bxvhabbuxwsdwpfeklfc).
-- Additive only. Safe to re-run.

-- Default Kanban query: active tasks for one project, ordered by created_at.
create index if not exists tasks_project_active_created_idx
  on public.tasks (project_id, created_at)
  where archived_at is null;

-- Home / count queries: active rows by project + status.
create index if not exists tasks_project_active_status_idx
  on public.tasks (project_id, status)
  where archived_at is null;

-- Archived count and on-demand archived list.
create index if not exists tasks_project_archived_created_idx
  on public.tasks (project_id, created_at)
  where archived_at is not null;

-- Dependency lookup from the blocker side (002 already indexes blocked_task_id).
create index if not exists task_dependencies_blocker_idx
  on public.task_dependencies (blocker_task_id);
