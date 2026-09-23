export const TASK_STATUSES = ["inbox", "doing", "review", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const ASSIGNEE_TYPES = ["human", "bot"] as const;
export type AssigneeType = (typeof ASSIGNEE_TYPES)[number];

export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const TASK_EVENT_ACTIONS = [
  "status_change",
  "assignee_change",
  "priority_change",
  "archive",
  "create",
  "update",
  "dependency",
  "webhook",
  "override_start",
] as const;
export type TaskEventAction = (typeof TASK_EVENT_ACTIONS)[number];

export type Project = {
  id: string;
  slug: string;
  name: string;
  created_at: string;
};

export type Bot = {
  id: string;
  name: string;
  project_id: string;
  webhook_url: string | null;
  created_at: string;
};

export type Task = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  assignee_type: AssigneeType;
  bot_id: string | null;
  priority: Priority | null;
  due_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  webhook_error: string | null;
  webhook_fired_at: string | null;
};

export type TaskSummary = {
  id: string;
  title: string;
  status: TaskStatus;
  archived_at: string | null;
};

export type TaskWithRelations = Task & {
  bot: Bot | null;
  project: Project;
  blocked_by: TaskSummary[];
  blocks: TaskSummary[];
};

export type TaskEvent = {
  id: string;
  task_id: string;
  at: string;
  actor: string;
  action: TaskEventAction;
  from_value: string | null;
  to_value: string | null;
  meta: Record<string, unknown> | null;
};

export type ProjectWithBot = Project & {
  bots: Bot[];
};

export type DuplicateCandidate = TaskSummary;

export type ActionResult =
  | { ok: true; webhookError?: string | null; bodyWarning?: string }
  | {
      ok: false;
      error: string;
      code?: "duplicates" | "blocked";
      duplicates?: DuplicateCandidate[];
      blockers?: TaskSummary[];
    };
