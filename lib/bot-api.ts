import type { Bot, BotTaskPatch, Priority, Project, TaskStatus } from "./types";

const TASK_STATUS_VALUES: readonly TaskStatus[] = ["inbox", "doing", "review", "done"];
const PRIORITY_VALUES: readonly Priority[] = ["low", "medium", "high", "urgent"];

export type BotApiResult = {
  status: number;
  body: Record<string, unknown>;
};

export type { BotTaskPatch };

export type BotWithProject = Bot & { project: Project };

export type BotTaskRecord = {
  id: string;
  project_id: string;
  [key: string]: unknown;
};

export type BotTaskListFilters = {
  statuses?: TaskStatus[];
  includeArchived: boolean;
};

export type BotApiDeps = {
  isSupabaseConfigured: () => boolean;
  getBot: (id: string) => Promise<BotWithProject | null>;
  listProjectTasks: (projectId: string, filters: BotTaskListFilters) => Promise<unknown[]>;
  listDoingTasksForBot: (botId: string) => Promise<unknown[]>;
  getTask: (taskId: string) => Promise<BotTaskRecord | null>;
  updateBotProjectTask: (taskId: string, patch: BotTaskPatch, actor: string) => Promise<unknown>;
};

const FORBIDDEN_PATCH_KEYS = new Set([
  "status",
  "assignee_type",
  "assigneeType",
  "bot_id",
  "botId",
  "archived_at",
  "archivedAt",
]);

const ALLOWED_PATCH_KEYS = new Set(["description", "title", "priority", "due_at", "dueAt"]);

function jsonError(status: number, error: string): BotApiResult {
  return { status, body: { error } };
}

export function botActor(name: string): string {
  return `bot:${name}`;
}

export function authorizeBotApi(input: {
  bearerOk?: boolean;
  sessionOk?: boolean;
}): BotApiResult | { ok: true; via: "bearer" | "session" } {
  if (input.bearerOk) {
    return { ok: true, via: "bearer" };
  }
  if (input.sessionOk) {
    return { ok: true, via: "session" };
  }
  return jsonError(401, "Unauthorized");
}

export function parseTaskListQuery(searchParams: URLSearchParams):
  | { ok: true; filters: BotTaskListFilters }
  | BotApiResult {
  const statusRaw = searchParams.get("status");
  let statuses: TaskStatus[] | undefined;

  if (statusRaw !== null && statusRaw.trim() !== "") {
    const parts = statusRaw
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
    const invalid = parts.filter((part) => !TASK_STATUS_VALUES.includes(part as TaskStatus));
    if (invalid.length > 0) {
      return jsonError(400, `Invalid status: ${invalid.join(", ")}`);
    }
    statuses = parts as TaskStatus[];
  }

  const archivedRaw = searchParams.get("include_archived");
  let includeArchived = false;
  if (archivedRaw !== null && archivedRaw.trim() !== "") {
    const normalized = archivedRaw.trim().toLowerCase();
    if (normalized === "true" || normalized === "1" || normalized === "yes") {
      includeArchived = true;
    } else if (normalized === "false" || normalized === "0" || normalized === "no") {
      includeArchived = false;
    } else {
      return jsonError(400, "Invalid include_archived");
    }
  }

  return { ok: true, filters: { statuses, includeArchived } };
}

export function parseBotTaskPatch(body: unknown): { ok: true; patch: BotTaskPatch } | BotApiResult {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return jsonError(400, "JSON object required");
  }

  const record = body as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0) {
    return jsonError(400, "No fields to update");
  }

  const forbidden = keys.filter((key) => FORBIDDEN_PATCH_KEYS.has(key));
  if (forbidden.length > 0) {
    return jsonError(403, "Cannot change status, assignee_type, bot_id, or archived_at");
  }

  const unknown = keys.filter((key) => !ALLOWED_PATCH_KEYS.has(key));
  if (unknown.length > 0) {
    return jsonError(400, `Unknown field: ${unknown.join(", ")}`);
  }

  if (record.due_at !== undefined && record.dueAt !== undefined) {
    return jsonError(400, "Use due_at or dueAt, not both");
  }

  const patch: BotTaskPatch = {};

  if (record.description !== undefined) {
    if (record.description !== null && typeof record.description !== "string") {
      return jsonError(400, "description must be a string or null");
    }
    patch.description = record.description === null ? null : record.description;
  }

  if (record.title !== undefined) {
    if (typeof record.title !== "string" || record.title.trim() === "") {
      return jsonError(400, "title must be a non-empty string");
    }
    patch.title = record.title;
  }

  if (record.priority !== undefined) {
    if (record.priority !== null && !PRIORITY_VALUES.includes(record.priority as Priority)) {
      return jsonError(400, "Invalid priority");
    }
    patch.priority = (record.priority as Priority | null) ?? null;
  }

  const dueValue = record.due_at !== undefined ? record.due_at : record.dueAt;
  if (dueValue !== undefined) {
    if (dueValue !== null && typeof dueValue !== "string") {
      return jsonError(400, "due_at must be a string or null");
    }
    if (typeof dueValue === "string" && dueValue.trim() !== "" && Number.isNaN(Date.parse(dueValue))) {
      return jsonError(400, "Invalid due_at");
    }
    patch.dueAt = dueValue === null || (typeof dueValue === "string" && dueValue.trim() === "") ? null : dueValue;
  }

  if (Object.keys(patch).length === 0) {
    return jsonError(400, "No fields to update");
  }

  return { ok: true, patch };
}

export function taskBelongsToBotProject(
  task: { project_id: string } | null,
  bot: { project_id: string }
): boolean {
  return Boolean(task && task.project_id === bot.project_id);
}

function serializeBot(bot: BotWithProject) {
  return {
    id: bot.id,
    name: bot.name,
    project_id: bot.project_id,
    project: {
      id: bot.project.id,
      slug: bot.project.slug,
      name: bot.project.name,
    },
  };
}

async function requireBot(
  botId: string,
  input: { bearerOk?: boolean; sessionOk?: boolean },
  deps: Pick<BotApiDeps, "isSupabaseConfigured" | "getBot">
): Promise<{ ok: true; bot: BotWithProject } | BotApiResult> {
  const auth = authorizeBotApi(input);
  if (!("ok" in auth)) {
    return auth;
  }

  if (!deps.isSupabaseConfigured()) {
    return jsonError(503, "Supabase is not configured");
  }

  const bot = await deps.getBot(botId);
  if (!bot) {
    return jsonError(404, "Bot not found");
  }

  return { ok: true, bot };
}

async function requireBotTask(
  botId: string,
  taskId: string,
  input: { bearerOk?: boolean; sessionOk?: boolean },
  deps: Pick<BotApiDeps, "isSupabaseConfigured" | "getBot" | "getTask">
): Promise<{ ok: true; bot: BotWithProject; task: BotTaskRecord } | BotApiResult> {
  const context = await requireBot(botId, input, deps);
  if (!("ok" in context)) {
    return context;
  }

  const task = await deps.getTask(taskId);
  if (!taskBelongsToBotProject(task, context.bot)) {
    return jsonError(404, "Task not found");
  }

  return { ok: true, bot: context.bot, task: task as BotTaskRecord };
}

export async function handleGetBotCurrent(input: {
  botId: string;
  bearerOk?: boolean;
  sessionOk?: boolean;
  deps: Pick<BotApiDeps, "isSupabaseConfigured" | "getBot" | "listDoingTasksForBot">;
}): Promise<BotApiResult> {
  const context = await requireBot(input.botId, input, input.deps);
  if (!("ok" in context)) {
    return context;
  }

  const tasks = await input.deps.listDoingTasksForBot(input.botId);
  return {
    status: 200,
    body: {
      bot: serializeBot(context.bot),
      tasks,
    },
  };
}

export async function handleGetBotTasks(input: {
  botId: string;
  searchParams: URLSearchParams;
  bearerOk?: boolean;
  sessionOk?: boolean;
  deps: Pick<BotApiDeps, "isSupabaseConfigured" | "getBot" | "listProjectTasks">;
}): Promise<BotApiResult> {
  const context = await requireBot(input.botId, input, input.deps);
  if (!("ok" in context)) {
    return context;
  }

  const parsed = parseTaskListQuery(input.searchParams);
  if (!("ok" in parsed)) {
    return parsed;
  }

  const tasks = await input.deps.listProjectTasks(context.bot.project_id, parsed.filters);
  return {
    status: 200,
    body: {
      bot: serializeBot(context.bot),
      tasks,
    },
  };
}

export async function handleGetBotTask(input: {
  botId: string;
  taskId: string;
  bearerOk?: boolean;
  sessionOk?: boolean;
  deps: Pick<BotApiDeps, "isSupabaseConfigured" | "getBot" | "getTask">;
}): Promise<BotApiResult> {
  const context = await requireBotTask(input.botId, input.taskId, input, input.deps);
  if (!("ok" in context)) {
    return context;
  }

  return {
    status: 200,
    body: {
      bot: serializeBot(context.bot),
      task: context.task,
    },
  };
}

export async function handlePatchBotTask(input: {
  botId: string;
  taskId: string;
  body: unknown;
  bearerOk?: boolean;
  sessionOk?: boolean;
  deps: Pick<BotApiDeps, "isSupabaseConfigured" | "getBot" | "getTask" | "updateBotProjectTask">;
}): Promise<BotApiResult> {
  const context = await requireBotTask(input.botId, input.taskId, input, input.deps);
  if (!("ok" in context)) {
    return context;
  }

  const parsed = parseBotTaskPatch(input.body);
  if (!("ok" in parsed)) {
    return parsed;
  }

  const task = await input.deps.updateBotProjectTask(
    input.taskId,
    parsed.patch,
    botActor(context.bot.name)
  );

  return {
    status: 200,
    body: {
      bot: serializeBot(context.bot),
      task,
    },
  };
}

export function parseJsonBody(raw: string): { ok: true; body: unknown } | BotApiResult {
  if (raw.trim() === "") {
    return jsonError(400, "JSON object required");
  }
  try {
    return { ok: true, body: JSON.parse(raw) as unknown };
  } catch {
    return jsonError(400, "Invalid JSON");
  }
}
