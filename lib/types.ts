export const TASK_STATUSES = ["inbox", "doing", "review", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const ASSIGNEE_TYPES = ["human", "bot"] as const;
export type AssigneeType = (typeof ASSIGNEE_TYPES)[number];

export const PRIORITIES = ["low", "medium", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

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
  created_at: string;
  updated_at: string;
  started_at: string | null;
  webhook_error: string | null;
  webhook_fired_at: string | null;
};

export type TaskWithRelations = Task & {
  bot: Bot | null;
  project: Project;
};

export type ProjectWithBot = Project & {
  bots: Bot[];
};

export type ActionResult =
  | { ok: true; webhookError?: string | null }
  | { ok: false; error: string };
