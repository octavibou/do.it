import "server-only";

import { cache } from "react";

import { findSimilarTitles } from "@/lib/duplicates";
import { AssigneeBotError, DependencyBlockError, DuplicateTaskError } from "@/lib/errors";
import { formatAssigneeValue } from "@/lib/labels";
import { logBoardOpen, measureAsync } from "@/lib/perf";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  chunkIds,
  joinDependencyMaps,
  uniqueDependencyEdges,
  type DependencyEdge,
} from "@/lib/task-deps";
import { incompleteBlockers } from "@/lib/task-rules";
import type {
  AssigneeType,
  Bot,
  BotTaskCreate,
  BotTaskPatch,
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
const BOARD_TASK_SELECT =
  "id, project_id, title, description, status, assignee_type, bot_id, priority, due_at, archived_at, created_at, updated_at, started_at, webhook_error, webhook_fired_at, bot:bots(id, name, project_id, webhook_url, created_at)";
const PROJECT_SELECT = "id, slug, name, created_at";
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

async function fetchDependencyEdges(ids: string[]): Promise<{ edges: DependencyEdge[]; queryCount: number }> {
  if (ids.length === 0) {
    return { edges: [], queryCount: 0 };
  }

  const supabase = createAdminClient();
  const chunks = chunkIds(ids);
  const results = await Promise.all(
    chunks.flatMap((chunk) => [
      supabase
        .from("task_dependencies")
        .select("blocker_task_id, blocked_task_id")
        .in("blocker_task_id", chunk),
      supabase
        .from("task_dependencies")
        .select("blocker_task_id, blocked_task_id")
        .in("blocked_task_id", chunk),
    ])
  );

  const edges: DependencyEdge[] = [];
  for (const result of results) {
    if (result.error) {
      throw result.error;
    }
    for (const row of result.data ?? []) {
      edges.push(row as DependencyEdge);
    }
  }

  return { edges: uniqueDependencyEdges(edges), queryCount: results.length };
}

async function attachDependencies(tasks: TaskRow[]): Promise<{ tasks: TaskWithRelations[]; queryCount: number }> {
  if (tasks.length === 0) {
    return { tasks: [], queryCount: 0 };
  }

  const ids = tasks.map((task) => task.id);
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const { edges, queryCount } = await fetchDependencyEdges(ids);

  const missingIds = new Set<string>();
  for (const row of edges) {
    if (!byId.has(row.blocker_task_id)) {
      missingIds.add(row.blocker_task_id);
    }
    if (!byId.has(row.blocked_task_id)) {
      missingIds.add(row.blocked_task_id);
    }
  }

  const extra = new Map<string, TaskSummary>();
  let extraQueries = 0;
  if (missingIds.size > 0) {
    const supabase = createAdminClient();
    extraQueries = 1;
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

  const joined = joinDependencyMaps(ids, edges, summaryOf);
  return {
    queryCount: queryCount + extraQueries,
    tasks: tasks.map((task) => {
      const deps = joined.get(task.id) ?? { blocked_by: [], blocks: [] };
      return { ...withEmptyDeps(task), blocked_by: deps.blocked_by, blocks: deps.blocks };
    }),
  };
}

async function attachDependenciesOnly(tasks: TaskRow[]): Promise<TaskWithRelations[]> {
  const { tasks: next } = await attachDependencies(tasks);
  return next;
}

export const listProjects = cache(async (): Promise<ProjectWithBot[]> => {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("projects")
    .select(`${PROJECT_SELECT}, bots(id, name, project_id, webhook_url, created_at)`)
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as ProjectWithBot[];
});

export type StatusCounts = Record<string, Record<TaskStatus, number>>;

function emptyStatusCounts(): Record<TaskStatus, number> {
  return { inbox: 0, doing: 0, review: 0, done: 0 };
}

export async function listActiveTaskStatusCounts(): Promise<{ counts: StatusCounts; source: "rpc" | "rows" }> {
  const supabase = createAdminClient();
  const rpc = await supabase.rpc("active_task_status_counts");
  if (!rpc.error && rpc.data) {
    const counts: StatusCounts = {};
    for (const row of rpc.data as { project_id: string; status: TaskStatus; n: number }[]) {
      counts[row.project_id] ??= emptyStatusCounts();
      counts[row.project_id][row.status] = Number(row.n);
    }
    return { counts, source: "rpc" };
  }

  const { data, error } = await supabase
    .from("tasks")
    .select("project_id, status")
    .is("archived_at", null);

  if (error) {
    throw error;
  }

  const counts: StatusCounts = {};
  for (const row of data ?? []) {
    const projectId = row.project_id as string;
    const status = row.status as TaskStatus;
    counts[projectId] ??= emptyStatusCounts();
    counts[projectId][status] += 1;
  }
  return { counts, source: "rows" };
}

export const getProjectBySlug = cache(async (slug: string): Promise<ProjectWithBot | null> => {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("projects")
    .select(`${PROJECT_SELECT}, bots(id, name, project_id, webhook_url, created_at)`)
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return (data as ProjectWithBot | null) ?? null;
});

function asBoardTaskRow(row: Omit<TaskRow, "project">, project: Project): TaskRow {
  return {
    ...(row as TaskRow),
    due_at: row.due_at ?? null,
    archived_at: row.archived_at ?? null,
    bot: row.bot ?? null,
    project,
  };
}

async function listBoardTaskRows(
  projectId: string,
  archived: boolean
): Promise<Omit<TaskRow, "project">[]> {
  const supabase = createAdminClient();
  let query = supabase.from("tasks").select(BOARD_TASK_SELECT).eq("project_id", projectId);
  query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);

  const { data, error } = await query.order("created_at", { ascending: true });
  if (error) {
    throw error;
  }
  return (data ?? []) as unknown as Omit<TaskRow, "project">[];
}

async function countArchivedTasks(projectId: string): Promise<number> {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .not("archived_at", "is", null);

  if (error) {
    throw error;
  }

  return count ?? 0;
}

async function hydrateBoardTasks(project: Project, archived: boolean) {
  const rows = await listBoardTaskRows(project.id, archived);
  return attachDependencies(rows.map((row) => asBoardTaskRow(row, project)));
}

export async function listArchivedTasksForProject(projectId: string): Promise<TaskWithRelations[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("projects")
    .select(PROJECT_SELECT)
    .eq("id", projectId)
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data) {
    return [];
  }

  const { tasks } = await hydrateBoardTasks(data as Project, true);
  return tasks;
}

export async function loadProjectBoard(slug: string): Promise<{
  project: ProjectWithBot | null;
  tasks: TaskWithRelations[];
  archivedCount: number;
}> {
  const total = await measureAsync("total", async () => {
    const projectResult = await measureAsync("project", () => getProjectBySlug(slug));
    if (!projectResult.value) {
      return {
        project: null as ProjectWithBot | null,
        tasks: [] as TaskWithRelations[],
        archivedCount: 0,
        queryCount: 1,
        timingsMs: { project: projectResult.ms, tasks: 0, deps: 0, archived: 0, total: projectResult.ms },
      };
    }

    const project = projectResult.value;
    const [tasksResult, archivedResult] = await Promise.all([
      measureAsync("tasks", () => listBoardTaskRows(project.id, false)),
      measureAsync("archived", () => countArchivedTasks(project.id)),
    ]);

    const depsResult = await measureAsync("deps", () =>
      attachDependencies(tasksResult.value.map((row) => asBoardTaskRow(row, project)))
    );

    const timingsMs = {
      project: projectResult.ms,
      tasks: tasksResult.ms,
      deps: depsResult.ms,
      archived: archivedResult.ms,
      total: 0,
    };
    const queryCount = 1 + 1 + 1 + depsResult.value.queryCount;

    return {
      project,
      tasks: depsResult.value.tasks,
      archivedCount: archivedResult.value,
      queryCount,
      timingsMs,
    };
  });

  const payload = total.value;
  payload.timingsMs.total = total.ms;
  logBoardOpen({
    slug,
    taskCount: payload.tasks.length,
    archivedCount: payload.archivedCount,
    queryCount: payload.queryCount,
    timingsMs: payload.timingsMs,
  });

  return {
    project: payload.project,
    tasks: payload.tasks,
    archivedCount: payload.archivedCount,
  };
}

export async function listTasksForProject(projectId: string): Promise<TaskWithRelations[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(BOARD_TASK_SELECT)
    .eq("project_id", projectId)
    .is("archived_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select(PROJECT_SELECT)
    .eq("id", projectId)
    .maybeSingle();
  if (projectError) {
    throw projectError;
  }
  if (!project) {
    return [];
  }

  return attachDependenciesOnly(
    ((data ?? []) as unknown as Omit<TaskRow, "project">[]).map((row) =>
      asBoardTaskRow(row, project as Project)
    )
  );
}

export async function listProjectTasks(
  projectId: string,
  options: { statuses?: TaskStatus[]; includeArchived?: boolean } = {}
): Promise<TaskWithRelations[]> {
  const supabase = createAdminClient();
  let query = supabase.from("tasks").select(TASK_SELECT).eq("project_id", projectId);

  if (!options.includeArchived) {
    query = query.is("archived_at", null);
  }
  if (options.statuses && options.statuses.length > 0) {
    query = query.in("status", options.statuses);
  }

  const { data, error } = await query.order("created_at", { ascending: true });

  if (error) {
    throw error;
  }

  return attachDependenciesOnly((data ?? []) as TaskRow[]);
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
  const [task] = await attachDependenciesOnly([data as TaskRow]);
  return task ?? null;
}

export const listBots = cache(async (): Promise<(Bot & { project: Project })[]> => {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("bots")
    .select("id, name, project_id, webhook_url, created_at, project:projects(id, slug, name, created_at)")
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  return (data ?? []) as unknown as (Bot & { project: Project })[];
});

export type DoingBotWork = {
  id: string;
  title: string;
  bot_id: string | null;
  webhook_error: string | null;
};

export async function listDoingBotWork(): Promise<DoingBotWork[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, bot_id, webhook_error")
    .eq("assignee_type", "bot")
    .eq("status", "doing")
    .is("archived_at", null)
    .order("started_at", { ascending: true, nullsFirst: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as DoingBotWork[];
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

  return attachDependenciesOnly((data ?? []) as TaskRow[]);
}

export async function listAllDoingBotTasks(): Promise<TaskWithRelations[]> {
  const { data, error } = await doingBotQuery().order("started_at", {
    ascending: true,
    nullsFirst: false,
  });

  if (error) {
    throw error;
  }

  return attachDependenciesOnly((data ?? []) as TaskRow[]);
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
  actor?: string;
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

function collectUpdateEvents(previous: Task, next: Task, actor?: string): EventInput[] {
  const events: EventInput[] = [];

  if (previous.status !== next.status) {
    events.push({
      taskId: next.id,
      actor,
      action: "status_change",
      fromValue: previous.status,
      toValue: next.status,
    });
  }
  if (previous.assignee_type !== next.assignee_type || previous.bot_id !== next.bot_id) {
    events.push({
      taskId: next.id,
      actor,
      action: "assignee_change",
      fromValue: formatAssigneeValue(previous.assignee_type, previous.bot_id),
      toValue: formatAssigneeValue(next.assignee_type, next.bot_id),
    });
  }
  if (previous.priority !== next.priority) {
    events.push({
      taskId: next.id,
      actor,
      action: "priority_change",
      fromValue: previous.priority,
      toValue: next.priority,
    });
  }
  if ((previous.due_at ?? null) !== (next.due_at ?? null)) {
    events.push({
      taskId: next.id,
      actor,
      action: "update",
      fromValue: previous.due_at,
      toValue: next.due_at,
      meta: { field: "due_at" },
    });
  }
  if (previous.title !== next.title || (previous.description ?? "") !== (next.description ?? "")) {
    events.push({
      taskId: next.id,
      actor,
      action: "update",
      fromValue: previous.title,
      toValue: next.title,
      meta: { field: previous.title !== next.title ? "title" : "description" },
    });
  }

  return events;
}

async function assertAssigneeBotInProject(botId: string, projectId: string) {
  const assigneeBot = await getBot(botId);
  if (!assigneeBot) {
    throw new AssigneeBotError("Invalid bot_id");
  }
  if (assigneeBot.project_id !== projectId) {
    throw new AssigneeBotError("Bot does not belong to this project");
  }
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

  const [task] = await attachDependenciesOnly([data as TaskRow]);
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

  const assigneeChanging = input.assigneeType !== undefined || input.botId !== undefined;
  if (assigneeChanging && nextAssignee.assignee_type === "bot" && nextAssignee.bot_id) {
    await assertAssigneeBotInProject(nextAssignee.bot_id, previous.project_id);
  }

  if (nextStatus === "doing" && previous.status !== "doing") {
    const blockers = await assertCanEnterDoing(taskId, input.overrideStart);
    if (input.overrideStart && blockers.length > 0) {
      await recordTaskEvents([
        {
          taskId,
          actor: input.actor,
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

  const [task] = await attachDependenciesOnly([data as TaskRow]);
  await recordTaskEvents(collectUpdateEvents(asTask(previous), asTask(task), input.actor));
  const webhookError = await maybeFireWebhook(task, previous);
  return { task, webhookError };
}

function botPatchHasFieldUpdates(input: BotTaskPatch): boolean {
  return (
    input.title !== undefined ||
    input.description !== undefined ||
    input.priority !== undefined ||
    input.dueAt !== undefined ||
    input.status !== undefined ||
    input.assigneeType !== undefined ||
    input.botId !== undefined
  );
}

export async function updateBotProjectTask(
  taskId: string,
  input: BotTaskPatch,
  actor: string
): Promise<TaskWithRelations> {
  let task: TaskWithRelations | null = null;

  if (botPatchHasFieldUpdates(input)) {
    const result = await updateTask(taskId, {
      title: input.title,
      description: input.description,
      priority: input.priority,
      dueAt: input.dueAt,
      status: input.status,
      assigneeType: input.assigneeType,
      botId: input.botId,
      actor,
    });
    task = {
      ...result.task,
      webhook_error: result.webhookError ?? result.task.webhook_error,
    };
  }

  if (input.archivedAt !== undefined) {
    task = input.archivedAt === null ? await unarchiveTask(taskId, actor) : await archiveTask(taskId, actor);
  }

  if (!task) {
    const existing = await getTask(taskId);
    if (!existing) {
      throw new Error("Task not found");
    }
    return existing;
  }

  return task;
}

export async function createBotProjectTask(
  projectId: string,
  input: BotTaskCreate,
  actor: string
): Promise<TaskWithRelations> {
  const title = input.title.trim();
  const matches = await findDuplicateMatches(projectId, title);
  if (matches.length > 0) {
    throw new DuplicateTaskError(matches);
  }

  const supabase = createAdminClient();
  const assignee = normalizeAssignee({
    assigneeType: input.assigneeType,
    botId: input.botId,
  });

  // Always inbox. Bot API create must not dispatch doing webhooks.
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      project_id: projectId,
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
    if (error.code === "23505") {
      throw new DuplicateTaskError([]);
    }
    throw error;
  }

  const [task] = await attachDependenciesOnly([data as TaskRow]);
  await recordTaskEvents([
    {
      taskId: task.id,
      actor,
      action: "create",
      toValue: title,
      meta: {
        priority: task.priority,
        assignee: formatAssigneeValue(task.assignee_type, task.bot_id),
        due_at: task.due_at,
      },
    },
  ]);

  return task;
}

export async function moveTask(
  taskId: string,
  status: TaskStatus,
  options?: { overrideStart?: boolean }
): Promise<{ task: TaskWithRelations; webhookError: string | null }> {
  return updateTask(taskId, { status, overrideStart: options?.overrideStart });
}

export async function archiveTask(taskId: string, actor?: string): Promise<TaskWithRelations> {
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

  const [task] = await attachDependenciesOnly([data as TaskRow]);
  await recordTaskEvents([
    {
      taskId,
      actor,
      action: "archive",
      fromValue: (previous as TaskRow).archived_at,
      toValue: now,
    },
  ]);
  return task;
}

export async function unarchiveTask(taskId: string, actor?: string): Promise<TaskWithRelations> {
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

  const [task] = await attachDependenciesOnly([data as TaskRow]);
  await recordTaskEvents([
    {
      taskId,
      actor,
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

  const [task] = await attachDependenciesOnly([data as TaskRow]);
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
  const [next] = refreshed ? await attachDependenciesOnly([refreshed as TaskRow]) : [task];

  return {
    task: next,
    webhookError,
  };
}
