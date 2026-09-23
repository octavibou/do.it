import "server-only";

import { findSimilarTitles } from "@/lib/duplicates";
import { DependencyBlockError, DuplicateTaskError } from "@/lib/errors";
import { formatAssigneeValue } from "@/lib/labels";
import { createAdminClient } from "@/lib/supabase/admin";
import { incompleteBlockers } from "@/lib/task-rules";
import type {
  AssigneeType,
  Bot,
  Priority,
  Project,
  ProjectWithBot,
  Task,
  TaskEvent,
  TaskEventAction,
  TaskStatus,
  TaskSummary,
  TaskWithRelations,
} from "@/lib/types";
import { dispatchDoingWebhook, shouldDispatchDoingWebhook } from "@/lib/webhooks";

const TASK_SELECT = "*, bot:bots(*), project:projects(*)";
const ACTOR_OCTAVI = "octavi";
const ACTOR_SYSTEM = "system";

type TaskRow = Task & {
  bot: Bot | null;
  project: Project;
};

type EventInput = {
  taskId: string;
  actor?: string;
  action: TaskEventAction;
  fromValue?: string | null;
  toValue?: string | null;
  meta?: Record<string, unknown> | null;
};

function asTask(row: TaskRow | Task): Task {
  return {
    id: row.id,
    project_id: row.project_id,
    title: row.title,
    description: row.description,
    status: row.status,
    assignee_type: row.assignee_type,
    bot_id: row.bot_id,
    priority: row.priority,
    due_at: row.due_at ?? null,
    archived_at: row.archived_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    started_at: row.started_at,
    webhook_error: row.webhook_error,
    webhook_fired_at: row.webhook_fired_at,
  };
}

function asSummary(task: Pick<Task, "id" | "title" | "status" | "archived_at">): TaskSummary {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    archived_at: task.archived_at ?? null,
  };
}

function withEmptyDeps(row: TaskRow): TaskWithRelations {
  return { ...row, due_at: row.due_at ?? null, archived_at: row.archived_at ?? null, blocked_by: [], blocks: [] };
}

async function recordTaskEvents(events: EventInput[]): Promise<void> {
  if (events.length === 0) {
    return;
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("task_events").insert(
    events.map((event) => ({
      task_id: event.taskId,
      actor: event.actor ?? ACTOR_OCTAVI,
      action: event.action,
      from_value: event.fromValue ?? null,
      to_value: event.toValue ?? null,
      meta: event.meta ?? null,
    }))
  );

  if (error) {
    console.error("task_events insert failed", error);
  }
}

async function attachDependencies(tasks: TaskRow[]): Promise<TaskWithRelations[]> {
  if (tasks.length === 0) {
    return [];
  }

  const supabase = createAdminClient();
  const ids = tasks.map((task) => task.id);
  const byId = new Map(tasks.map((task) => [task.id, task]));

  const { data, error } = await supabase
    .from("task_dependencies")
    .select("blocker_task_id, blocked_task_id")
    .or(`blocker_task_id.in.(${ids.join(",")}),blocked_task_id.in.(${ids.join(",")})`);

  if (error) {
    throw error;
  }

  const missingIds = new Set<string>();
  for (const row of data ?? []) {
    if (!byId.has(row.blocker_task_id)) {
      missingIds.add(row.blocker_task_id);
    }
    if (!byId.has(row.blocked_task_id)) {
      missingIds.add(row.blocked_task_id);
    }
  }

  const extra = new Map<string, TaskSummary>();
  if (missingIds.size > 0) {
    const { data: extraRows, error: extraError } = await supabase
      .from("tasks")
      .select("id, title, status, archived_at")
      .in("id", [...missingIds]);
    if (extraError) {
      throw extraError;
    }
    for (const row of extraRows ?? []) {
      extra.set(row.id, asSummary(row as Task));
    }
  }

  const summaryOf = (id: string): TaskSummary | null => {
    const local = byId.get(id);
    if (local) {
      return asSummary(local);
    }
    return extra.get(id) ?? null;
  };

  return tasks.map((task) => {
    const blocked_by: TaskSummary[] = [];
    const blocks: TaskSummary[] = [];
    for (const row of data ?? []) {
      if (row.blocked_task_id === task.id) {
        const blocker = summaryOf(row.blocker_task_id);
        if (blocker) {
          blocked_by.push(blocker);
        }
      }
      if (row.blocker_task_id === task.id) {
        const blocked = summaryOf(row.blocked_task_id);
        if (blocked) {
          blocks.push(blocked);
        }
      }
    }
    return { ...withEmptyDeps(task), blocked_by, blocks };
  });
}

export async function listProjects(): Promise<ProjectWithBot[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*, bots(*)")
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as ProjectWithBot[];
}

export async function getProjectBySlug(slug: string): Promise<ProjectWithBot | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("projects")
    .select("*, bots(*)")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as ProjectWithBot | null) ?? null;
}

export async function listTasksForProject(projectId: string): Promise<TaskWithRelations[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return attachDependencies((data ?? []) as TaskRow[]);
}

export async function getTask(taskId: string): Promise<TaskWithRelations | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("tasks").select(TASK_SELECT).eq("id", taskId).maybeSingle();
  if (error) {
    throw error;
  }
  if (!data) {
    return null;
  }
  const [task] = await attachDependencies([data as TaskRow]);
  return task ?? null;
}

export async function listBots(): Promise<(Bot & { project: Project })[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("bots")
    .select("*, project:projects(*)")
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as (Bot & { project: Project })[];
}

export async function getBot(id: string): Promise<(Bot & { project: Project }) | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("bots")
    .select("*, project:projects(*)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as (Bot & { project: Project }) | null) ?? null;
}

function doingBotQuery() {
  return createAdminClient()
    .from("tasks")
    .select(TASK_SELECT)
    .eq("assignee_type", "bot")
    .eq("status", "doing")
    .is("archived_at", null);
}

export async function listDoingTasksForBot(botId: string): Promise<TaskWithRelations[]> {
  const { data, error } = await doingBotQuery()
    .eq("bot_id", botId)
    .order("started_at", { ascending: true, nullsFirst: false });

  if (error) {
    throw error;
  }

  return attachDependencies((data ?? []) as TaskRow[]);
}

export async function listAllDoingBotTasks(): Promise<TaskWithRelations[]> {
  const { data, error } = await doingBotQuery().order("started_at", {
    ascending: true,
    nullsFirst: false,
  });

  if (error) {
    throw error;
  }

  return attachDependencies((data ?? []) as TaskRow[]);
}

export async function listTaskEvents(taskId: string, limit = 30): Promise<TaskEvent[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("task_events")
    .select("*")
    .eq("task_id", taskId)
    .order("at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []) as TaskEvent[];
}

export type TaskInput = {
  projectId: string;
  title: string;
  description?: string | null;
  status?: TaskStatus;
  assigneeType: AssigneeType;
  botId?: string | null;
  priority?: Priority | null;
  dueAt?: string | null;
  overrideStart?: boolean;
  forceCreate?: boolean;
};

function normalizeAssignee(input: {
  assigneeType: AssigneeType;
  botId?: string | null;
}): { assignee_type: AssigneeType; bot_id: string | null } {
  if (input.assigneeType === "bot") {
    if (!input.botId) {
      throw new Error("Selecciona un bot");
    }
    return { assignee_type: "bot", bot_id: input.botId };
  }
  return { assignee_type: "human", bot_id: null };
}

async function persistWebhookResult(
  taskId: string,
  result: { ok: true } | { ok: false; error: string }
) {
  const supabase = createAdminClient();
  if (result.ok) {
    await supabase
      .from("tasks")
      .update({ webhook_error: null, webhook_fired_at: new Date().toISOString() })
      .eq("id", taskId);
    await recordTaskEvents([
      {
        taskId,
        actor: ACTOR_SYSTEM,
        action: "webhook",
        fromValue: "pending",
        toValue: "ok",
      },
    ]);
    return null;
  }

  await supabase.from("tasks").update({ webhook_error: result.error }).eq("id", taskId);
  await recordTaskEvents([
    {
      taskId,
      actor: ACTOR_SYSTEM,
      action: "webhook",
      fromValue: "pending",
      toValue: "fail",
      meta: { error: result.error },
    },
  ]);
  return result.error;
}

async function maybeFireWebhook(task: TaskWithRelations, previous: Task | null) {
  if (
    !shouldDispatchDoingWebhook({
      nextStatus: task.status,
      assigneeType: task.assignee_type,
      previousStatus: previous?.status ?? null,
      previousAssigneeType: previous?.assignee_type ?? null,
    })
  ) {
    return null;
  }

  if (!task.bot) {
    const error = "La tarea está asignada a un bot que no existe.";
    await persistWebhookResult(task.id, { ok: false, error });
    return error;
  }

  const result = await dispatchDoingWebhook({
    task: asTask(task),
    project: task.project,
    bot: task.bot,
  });

  return persistWebhookResult(task.id, result);
}

async function loadBlockers(taskId: string): Promise<TaskSummary[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("task_dependencies")
    .select("blocker_task_id")
    .eq("blocked_task_id", taskId);

  if (error) {
    throw error;
  }

  const ids = (data ?? []).map((row) => row.blocker_task_id);
  if (ids.length === 0) {
    return [];
  }

  const { data: blockers, error: blockerError } = await supabase
    .from("tasks")
    .select("id, title, status, archived_at")
    .in("id", ids);

  if (blockerError) {
    throw blockerError;
  }

  return (blockers ?? []).map((row) => asSummary(row as Task));
}

async function assertCanEnterDoing(taskId: string, overrideStart?: boolean) {
  const blockers = incompleteBlockers(await loadBlockers(taskId));
  if (blockers.length > 0 && !overrideStart) {
    throw new DependencyBlockError(blockers);
  }
  return blockers;
}

async function findDuplicateMatches(projectId: string, title: string, excludeId?: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, status, archived_at")
    .eq("project_id", projectId)
    .is("archived_at", null);

  if (error) {
    throw error;
  }

  return findSimilarTitles(title, (data ?? []) as TaskSummary[], excludeId);
}

function collectUpdateEvents(previous: Task, next: Task): EventInput[] {
  const events: EventInput[] = [];

  if (previous.status !== next.status) {
    events.push({
      taskId: next.id,
      action: "status_change",
      fromValue: previous.status,
      toValue: next.status,
    });
  }
  if (previous.assignee_type !== next.assignee_type || previous.bot_id !== next.bot_id) {
    events.push({
      taskId: next.id,
      action: "assignee_change",
      fromValue: formatAssigneeValue(previous.assignee_type, previous.bot_id),
      toValue: formatAssigneeValue(next.assignee_type, next.bot_id),
    });
  }
  if (previous.priority !== next.priority) {
    events.push({
      taskId: next.id,
      action: "priority_change",
      fromValue: previous.priority,
      toValue: next.priority,
    });
  }
  if ((previous.due_at ?? null) !== (next.due_at ?? null)) {
    events.push({
      taskId: next.id,
      action: "update",
      fromValue: previous.due_at,
      toValue: next.due_at,
      meta: { field: "due_at" },
    });
  }
  if (previous.title !== next.title || (previous.description ?? "") !== (next.description ?? "")) {
    events.push({
      taskId: next.id,
      action: "update",
      fromValue: previous.title,
      toValue: next.title,
      meta: { field: previous.title !== next.title ? "title" : "description" },
    });
  }

  return events;
}

export async function createTask(
  input: TaskInput
): Promise<{ task: TaskWithRelations; webhookError: string | null }> {
  const title = input.title.trim();
  if (!input.forceCreate) {
    const matches = await findDuplicateMatches(input.projectId, title);
    if (matches.length > 0) {
      throw new DuplicateTaskError(matches);
    }
  }

  const supabase = createAdminClient();
  const assignee = normalizeAssignee(input);

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      project_id: input.projectId,
      title,
      description: input.description?.trim() || null,
      status: "inbox",
      ...assignee,
      priority: input.priority ?? null,
      due_at: input.dueAt ?? null,
      started_at: null,
    })
    .select(TASK_SELECT)
    .single();

  if (error) {
    throw error;
  }

  const [task] = await attachDependencies([data as TaskRow]);
  await recordTaskEvents([
    {
      taskId: task.id,
      action: "create",
      toValue: title,
      meta: {
        priority: task.priority,
        assignee: formatAssigneeValue(task.assignee_type, task.bot_id),
        due_at: task.due_at,
      },
    },
  ]);

  const webhookError = await maybeFireWebhook(task, null);
  return { task, webhookError };
}

export async function updateTask(
  taskId: string,
  input: Partial<TaskInput> & { title?: string; description?: string | null }
): Promise<{ task: TaskWithRelations; webhookError: string | null }> {
  const supabase = createAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("id", taskId)
    .single();

  if (existingError) {
    throw existingError;
  }

  const previous = existing as TaskRow;
  const nextStatus = input.status ?? previous.status;
  const nextAssignee = normalizeAssignee({
    assigneeType: input.assigneeType ?? previous.assignee_type,
    botId: input.assigneeType
      ? input.botId
      : input.botId === undefined
        ? previous.bot_id
        : input.botId,
  });

  if (nextStatus === "doing" && previous.status !== "doing") {
    const blockers = await assertCanEnterDoing(taskId, input.overrideStart);
    if (input.overrideStart && blockers.length > 0) {
      await recordTaskEvents([
        {
          taskId,
          action: "override_start",
          fromValue: previous.status,
          toValue: "doing",
          meta: { blockers: blockers.map((item) => item.id) },
        },
      ]);
    }
  }

  const patch: Record<string, unknown> = {
    ...nextAssignee,
    status: nextStatus,
  };

  if (input.title !== undefined) {
    patch.title = input.title.trim();
  }
  if (input.description !== undefined) {
    patch.description = input.description?.trim() || null;
  }
  if (input.priority !== undefined) {
    patch.priority = input.priority;
  }
  if (input.dueAt !== undefined) {
    patch.due_at = input.dueAt;
  }
  if (input.projectId) {
    patch.project_id = input.projectId;
  }
  if (nextStatus === "doing" && previous.status !== "doing") {
    patch.started_at = new Date().toISOString();
  }
  if (nextStatus !== "doing") {
    patch.webhook_error = null;
  }

  const { data, error } = await supabase
    .from("tasks")
    .update(patch)
    .eq("id", taskId)
    .select(TASK_SELECT)
    .single();

  if (error) {
    throw error;
  }

  const [task] = await attachDependencies([data as TaskRow]);
  await recordTaskEvents(collectUpdateEvents(asTask(previous), asTask(task)));
  const webhookError = await maybeFireWebhook(task, previous);
  return { task, webhookError };
}

export async function moveTask(
  taskId: string,
  status: TaskStatus,
  options?: { overrideStart?: boolean }
): Promise<{ task: TaskWithRelations; webhookError: string | null }> {
  return updateTask(taskId, { status, overrideStart: options?.overrideStart });
}

export async function archiveTask(taskId: string): Promise<TaskWithRelations> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();
  const { data: previous, error: previousError } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("id", taskId)
    .single();

  if (previousError) {
    throw previousError;
  }

  const { data, error } = await supabase
    .from("tasks")
    .update({ archived_at: now })
    .eq("id", taskId)
    .select(TASK_SELECT)
    .single();

  if (error) {
    throw error;
  }

  const [task] = await attachDependencies([data as TaskRow]);
  await recordTaskEvents([
    {
      taskId,
      action: "archive",
      fromValue: (previous as TaskRow).archived_at,
      toValue: now,
    },
  ]);
  return task;
}

export async function unarchiveTask(taskId: string): Promise<TaskWithRelations> {
  const supabase = createAdminClient();
  const { data: previous, error: previousError } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("id", taskId)
    .single();

  if (previousError) {
    throw previousError;
  }

  const { data, error } = await supabase
    .from("tasks")
    .update({ archived_at: null })
    .eq("id", taskId)
    .select(TASK_SELECT)
    .single();

  if (error) {
    throw error;
  }

  const [task] = await attachDependencies([data as TaskRow]);
  await recordTaskEvents([
    {
      taskId,
      action: "archive",
      fromValue: (previous as TaskRow).archived_at,
      toValue: null,
      meta: { restored: true },
    },
  ]);
  return task;
}

export async function addTaskDependency(blockerTaskId: string, blockedTaskId: string): Promise<void> {
  if (blockerTaskId === blockedTaskId) {
    throw new Error("Una tarea no puede bloquearse a sí misma.");
  }

  const supabase = createAdminClient();
  const { data: pair, error: pairError } = await supabase
    .from("tasks")
    .select("id, project_id, title")
    .in("id", [blockerTaskId, blockedTaskId]);

  if (pairError) {
    throw pairError;
  }

  const blocker = pair?.find((row) => row.id === blockerTaskId);
  const blocked = pair?.find((row) => row.id === blockedTaskId);
  if (!blocker || !blocked) {
    throw new Error("No se encontraron las tareas de la dependencia.");
  }
  if (blocker.project_id !== blocked.project_id) {
    throw new Error("Las dependencias deben ser del mismo proyecto.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("task_dependencies")
    .select("blocker_task_id, blocked_task_id");

  if (existingError) {
    throw existingError;
  }

  const edges = new Map<string, string[]>();
  for (const row of existing ?? []) {
    const list = edges.get(row.blocker_task_id) ?? [];
    list.push(row.blocked_task_id);
    edges.set(row.blocker_task_id, list);
  }

  const queue = [blockedTaskId];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === blockerTaskId) {
      throw new Error("Esa dependencia formaría un ciclo.");
    }
    if (seen.has(current)) {
      continue;
    }
    seen.add(current);
    for (const next of edges.get(current) ?? []) {
      queue.push(next);
    }
  }

  const { error } = await supabase.from("task_dependencies").insert({
    blocker_task_id: blockerTaskId,
    blocked_task_id: blockedTaskId,
  });

  if (error) {
    if (error.code === "23505") {
      throw new Error("Esa dependencia ya existe.");
    }
    throw error;
  }

  await recordTaskEvents([
    {
      taskId: blockedTaskId,
      action: "dependency",
      fromValue: null,
      toValue: blockerTaskId,
      meta: { kind: "blocked_by", title: blocker.title },
    },
    {
      taskId: blockerTaskId,
      action: "dependency",
      fromValue: null,
      toValue: blockedTaskId,
      meta: { kind: "blocks", title: blocked.title },
    },
  ]);
}

export async function removeTaskDependency(blockerTaskId: string, blockedTaskId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("task_dependencies")
    .delete()
    .eq("blocker_task_id", blockerTaskId)
    .eq("blocked_task_id", blockedTaskId);

  if (error) {
    throw error;
  }

  await recordTaskEvents([
    {
      taskId: blockedTaskId,
      action: "dependency",
      fromValue: blockerTaskId,
      toValue: null,
      meta: { kind: "blocked_by", removed: true },
    },
    {
      taskId: blockerTaskId,
      action: "dependency",
      fromValue: blockedTaskId,
      toValue: null,
      meta: { kind: "blocks", removed: true },
    },
  ]);
}

export async function updateBotWebhook(botId: string, webhookUrl: string | null): Promise<Bot> {
  const supabase = createAdminClient();
  const cleaned = webhookUrl?.trim() || null;
  if (cleaned) {
    try {
      const parsed = new URL(cleaned);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        throw new Error("invalid");
      }
    } catch {
      throw new Error("La URL del webhook no es válida");
    }
  }

  const { data, error } = await supabase
    .from("bots")
    .update({ webhook_url: cleaned })
    .eq("id", botId)
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data as Bot;
}

export async function retryTaskWebhook(
  taskId: string
): Promise<{ task: TaskWithRelations; webhookError: string | null }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from("tasks").select(TASK_SELECT).eq("id", taskId).single();

  if (error) {
    throw error;
  }

  const [task] = await attachDependencies([data as TaskRow]);
  if (task.status !== "doing" || task.assignee_type !== "bot") {
    return { task, webhookError: task.webhook_error };
  }

  if (!task.bot) {
    const webhookError = await persistWebhookResult(task.id, {
      ok: false,
      error: "La tarea está asignada a un bot que no existe.",
    });
    return { task, webhookError };
  }

  const result = await dispatchDoingWebhook({
    task: asTask(task),
    project: task.project,
    bot: task.bot,
  });
  const webhookError = await persistWebhookResult(task.id, result);

  const { data: refreshed } = await supabase.from("tasks").select(TASK_SELECT).eq("id", taskId).single();
  const [next] = refreshed ? await attachDependencies([refreshed as TaskRow]) : [task];

  return {
    task: next,
    webhookError,
  };
}
