import { AssigneeBotError, DependencyBlockError } from "./errors";
import type { AssigneeType, Bot, BotTaskCreate, BotTaskPatch, Priority, Project, TaskStatus, TaskSummary } from "./types";

const TASK_STATUS_VALUES: readonly TaskStatus[] = ["inbox", "doing", "review", "done"];
const PRIORITY_VALUES: readonly Priority[] = ["low", "medium", "high", "urgent"];

export type BotApiResult = {
  status: number;
  body: Record<string, unknown>;
};

export type { BotTaskCreate, BotTaskPatch };

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
  createBotProjectTask: (
    projectId: string,
    input: BotTaskCreate,
    actor: string
  ) => Promise<unknown>;
};

const ALLOWED_PATCH_KEYS = new Set([
  "description",
  "title",
  "priority",
  "due_at",
  "dueAt",
  "status",
  "assignee_type",
  "assigneeType",
  "bot_id",
  "botId",
  "archived_at",
  "archivedAt",
]);

const FORBIDDEN_CREATE_KEYS = new Set([
  "archived_at",
  "archivedAt",
  "project_id",
  "projectId",
  "id",
  "started_at",
  "startedAt",
  "webhook_error",
  "webhook_fired_at",
  "created_at",
  "updated_at",
]);

const ALLOWED_CREATE_KEYS = new Set([
  "title",
  "description",
  "priority",
  "due_at",
  "dueAt",
  "assignee_type",
  "assigneeType",
  "bot_id",
  "botId",
  "status",
]);

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

function parseOptionalIso(
  value: unknown,
  field: string
): { ok: true; value: string | null } | BotApiResult {
  if (value !== null && typeof value !== "string") {
    return jsonError(400, `${field} must be a string or null`);
  }
  if (typeof value === "string" && value.trim() !== "" && Number.isNaN(Date.parse(value))) {
    return jsonError(400, `Invalid ${field}`);
  }
  return {
    ok: true,
    value: value === null || (typeof value === "string" && value.trim() === "") ? null : value,
  };
}

export function parseBotTaskPatch(
  body: unknown,
  selfBotId?: string
): { ok: true; patch: BotTaskPatch } | BotApiResult {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return jsonError(400, "JSON object required");
  }

  const record = body as Record<string, unknown>;
  const keys = Object.keys(record);
  if (keys.length === 0) {
    return jsonError(400, "No fields to update");
  }

  const unknown = keys.filter((key) => !ALLOWED_PATCH_KEYS.has(key));
  if (unknown.length > 0) {
    return jsonError(400, `Unknown field: ${unknown.join(", ")}`);
  }

  if (record.due_at !== undefined && record.dueAt !== undefined) {
    return jsonError(400, "Use due_at or dueAt, not both");
  }
  if (record.assignee_type !== undefined && record.assigneeType !== undefined) {
    return jsonError(400, "Use assignee_type or assigneeType, not both");
  }
  if (record.bot_id !== undefined && record.botId !== undefined) {
    return jsonError(400, "Use bot_id or botId, not both");
  }
  if (record.archived_at !== undefined && record.archivedAt !== undefined) {
    return jsonError(400, "Use archived_at or archivedAt, not both");
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
    const parsedDue = parseOptionalIso(dueValue, "due_at");
    if (!("ok" in parsedDue)) {
      return parsedDue;
    }
    patch.dueAt = parsedDue.value;
  }

  if (record.status !== undefined) {
    if (!TASK_STATUS_VALUES.includes(record.status as TaskStatus)) {
      return jsonError(400, "Invalid status");
    }
    patch.status = record.status as TaskStatus;
  }

  const assigneeTypeRaw =
    record.assignee_type !== undefined ? record.assignee_type : record.assigneeType;
  const botIdRaw = record.bot_id !== undefined ? record.bot_id : record.botId;

  if (assigneeTypeRaw !== undefined) {
    if (assigneeTypeRaw !== "human" && assigneeTypeRaw !== "bot") {
      return jsonError(400, "Invalid assignee_type");
    }
  }

  if (botIdRaw !== undefined && botIdRaw !== null && typeof botIdRaw !== "string") {
    return jsonError(400, "bot_id must be a string or null");
  }

  if (assigneeTypeRaw !== undefined || botIdRaw !== undefined) {
    const requestedBotId =
      botIdRaw === undefined
        ? undefined
        : botIdRaw === null || (typeof botIdRaw === "string" && botIdRaw.trim() === "")
          ? null
          : botIdRaw;
    const resolvedAssignee: AssigneeType | undefined =
      assigneeTypeRaw === "human" || assigneeTypeRaw === "bot"
        ? assigneeTypeRaw
        : requestedBotId
          ? "bot"
          : requestedBotId === null
            ? "human"
            : undefined;

    if (resolvedAssignee === "human") {
      if (requestedBotId) {
        return jsonError(400, "human assignee cannot have bot_id");
      }
      patch.assigneeType = "human";
      patch.botId = null;
    } else if (resolvedAssignee === "bot") {
      const resolvedBotId = requestedBotId ?? selfBotId ?? null;
      if (!resolvedBotId) {
        return jsonError(400, "bot_id required when assignee_type is bot");
      }
      patch.assigneeType = "bot";
      patch.botId = resolvedBotId;
    }
  }

  const archivedValue = record.archived_at !== undefined ? record.archived_at : record.archivedAt;
  if (archivedValue !== undefined) {
    const parsedArchived = parseOptionalIso(archivedValue, "archived_at");
    if (!("ok" in parsedArchived)) {
      return parsedArchived;
    }
    patch.archivedAt = parsedArchived.value;
  }

  if (Object.keys(patch).length === 0) {
    return jsonError(400, "No fields to update");
  }

  return { ok: true, patch };
}

export async function assertPatchAssigneeInProject(input: {
  patch: BotTaskPatch;
  projectId: string;
  getBot: (id: string) => Promise<{ project_id: string } | null>;
}): Promise<{ ok: true } | BotApiResult> {
  if (input.patch.assigneeType !== "bot") {
    return { ok: true };
  }

  const botId = input.patch.botId;
  if (!botId) {
    return jsonError(400, "bot_id required when assignee_type is bot");
  }

  const assigneeBot = await input.getBot(botId);
  if (!assigneeBot) {
    return jsonError(400, "Invalid bot_id");
  }
  if (assigneeBot.project_id !== input.projectId) {
    return jsonError(403, "Bot does not belong to this project");
  }

  return { ok: true };
}

export function parseBotTaskCreate(
  body: unknown,
  botId: string
): { ok: true; input: BotTaskCreate } | BotApiResult {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    return jsonError(400, "JSON object required");
  }

  const record = body as Record<string, unknown>;
  const keys = Object.keys(record);

  const forbidden = keys.filter((key) => FORBIDDEN_CREATE_KEYS.has(key));
  if (forbidden.length > 0) {
    return jsonError(403, "Cannot set archived_at, project_id, or identity fields on create");
  }

  if (record.status !== undefined && record.status !== "inbox") {
    return jsonError(403, "Cannot set status away from inbox on create");
  }

  const unknown = keys.filter((key) => !ALLOWED_CREATE_KEYS.has(key));
  if (unknown.length > 0) {
    return jsonError(400, `Unknown field: ${unknown.join(", ")}`);
  }

  if (typeof record.title !== "string" || record.title.trim() === "") {
    return jsonError(400, "title must be a non-empty string");
  }

  if (record.due_at !== undefined && record.dueAt !== undefined) {
    return jsonError(400, "Use due_at or dueAt, not both");
  }

  if (record.assignee_type !== undefined && record.assigneeType !== undefined) {
    return jsonError(400, "Use assignee_type or assigneeType, not both");
  }

  if (record.bot_id !== undefined && record.botId !== undefined) {
    return jsonError(400, "Use bot_id or botId, not both");
  }

  const input: BotTaskCreate = {
    title: record.title,
    assigneeType: "human",
    botId: null,
  };

  if (record.description !== undefined) {
    if (record.description !== null && typeof record.description !== "string") {
      return jsonError(400, "description must be a string or null");
    }
    input.description = record.description === null ? null : record.description;
  }

  if (record.priority !== undefined) {
    if (record.priority !== null && !PRIORITY_VALUES.includes(record.priority as Priority)) {
      return jsonError(400, "Invalid priority");
    }
    input.priority = (record.priority as Priority | null) ?? null;
  }

  const dueValue = record.due_at !== undefined ? record.due_at : record.dueAt;
  if (dueValue !== undefined) {
    if (dueValue !== null && typeof dueValue !== "string") {
      return jsonError(400, "due_at must be a string or null");
    }
    if (typeof dueValue === "string" && dueValue.trim() !== "" && Number.isNaN(Date.parse(dueValue))) {
      return jsonError(400, "Invalid due_at");
    }
    input.dueAt = dueValue === null || (typeof dueValue === "string" && dueValue.trim() === "") ? null : dueValue;
  }

  const assigneeTypeRaw =
    record.assignee_type !== undefined ? record.assignee_type : record.assigneeType;
  const botIdRaw = record.bot_id !== undefined ? record.bot_id : record.botId;

  if (assigneeTypeRaw !== undefined) {
    if (assigneeTypeRaw !== "human" && assigneeTypeRaw !== "bot") {
      return jsonError(400, "Invalid assignee_type");
    }
  }

  if (botIdRaw !== undefined && botIdRaw !== null && typeof botIdRaw !== "string") {
    return jsonError(400, "bot_id must be a string or null");
  }

  const requestedBotId = typeof botIdRaw === "string" ? botIdRaw : null;
  if (requestedBotId && requestedBotId !== botId) {
    return jsonError(403, "Cannot assign to another bot");
  }

  const wantsBot =
    assigneeTypeRaw === "bot" || (assigneeTypeRaw === undefined && requestedBotId === botId);

  if (wantsBot) {
    input.assigneeType = "bot";
    input.botId = botId;
  } else if (requestedBotId) {
    return jsonError(400, "human assignee cannot have bot_id");
  }

  return { ok: true, input };
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

  const parsed = parseBotTaskPatch(input.body, context.bot.id);
  if (!("ok" in parsed)) {
    return parsed;
  }

  const assigneeScope = await assertPatchAssigneeInProject({
    patch: parsed.patch,
    projectId: context.task.project_id,
    getBot: input.deps.getBot,
  });
  if (!("ok" in assigneeScope)) {
    return assigneeScope;
  }

  try {
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
  } catch (error) {
    if (error instanceof DependencyBlockError) {
      return {
        status: 409,
        body: {
          error: error.message,
          blockers: error.blockers,
        },
      };
    }
    if (error instanceof AssigneeBotError) {
      return jsonError(403, error.message);
    }
    throw error;
  }
}

export async function handlePostBotTask(input: {
  botId: string;
  body: unknown;
  bearerOk?: boolean;
  sessionOk?: boolean;
  deps: Pick<BotApiDeps, "isSupabaseConfigured" | "getBot" | "createBotProjectTask">;
}): Promise<BotApiResult> {
  const context = await requireBot(input.botId, input, input.deps);
  if (!("ok" in context)) {
    return context;
  }

  const parsed = parseBotTaskCreate(input.body, context.bot.id);
  if (!("ok" in parsed)) {
    return parsed;
  }

  try {
    const task = await input.deps.createBotProjectTask(
      context.bot.project_id,
      parsed.input,
      botActor(context.bot.name)
    );

    return {
      status: 201,
      body: {
        bot: serializeBot(context.bot),
        task,
      },
    };
  } catch (error) {
    if (error instanceof Error && error.name === "DuplicateTaskError") {
      const duplicates =
        "matches" in error && Array.isArray(error.matches)
          ? (error.matches as TaskSummary[])
          : [];
      return {
        status: 409,
        body: {
          error: error.message,
          duplicates,
        },
      };
    }
    throw error;
  }
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
