import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type {
  AssigneeType,
  Bot,
  Priority,
  Project,
  ProjectWithBot,
  Task,
  TaskStatus,
  TaskWithRelations,
} from "@/lib/types";
import { dispatchDoingWebhook, shouldDispatchDoingWebhook } from "@/lib/webhooks";

const TASK_SELECT = "*, bot:bots(*), project:projects(*)";

function asTask(row: TaskWithRelations | Task): Task {
  return {
    id: row.id,
    project_id: row.project_id,
    title: row.title,
    description: row.description,
    status: row.status,
    assignee_type: row.assignee_type,
    bot_id: row.bot_id,
    priority: row.priority,
    created_at: row.created_at,
    updated_at: row.updated_at,
    started_at: row.started_at,
    webhook_error: row.webhook_error,
    webhook_fired_at: row.webhook_fired_at,
  };
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

  return (data ?? []) as TaskWithRelations[];
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

export async function listDoingTasksForBot(botId: string): Promise<TaskWithRelations[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("bot_id", botId)
    .eq("assignee_type", "bot")
    .eq("status", "doing")
    .order("started_at", { ascending: true, nullsFirst: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as TaskWithRelations[];
}

export async function listAllDoingBotTasks(): Promise<TaskWithRelations[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("assignee_type", "bot")
    .eq("status", "doing")
    .order("started_at", { ascending: true, nullsFirst: false });

  if (error) {
    throw error;
  }

  return (data ?? []) as TaskWithRelations[];
}

export type TaskInput = {
  projectId: string;
  title: string;
  description?: string | null;
  status?: TaskStatus;
  assigneeType: AssigneeType;
  botId?: string | null;
  priority?: Priority | null;
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

async function persistWebhookResult(taskId: string, result: { ok: true } | { ok: false; error: string }) {
  const supabase = createAdminClient();
  if (result.ok) {
    await supabase
      .from("tasks")
      .update({ webhook_error: null, webhook_fired_at: new Date().toISOString() })
      .eq("id", taskId);
    return null;
  }

  await supabase.from("tasks").update({ webhook_error: result.error }).eq("id", taskId);
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

export async function createTask(input: TaskInput): Promise<{ task: TaskWithRelations; webhookError: string | null }> {
  const supabase = createAdminClient();
  const assignee = normalizeAssignee(input);
  const status = input.status ?? "inbox";
  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      project_id: input.projectId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      status,
      ...assignee,
      priority: input.priority ?? null,
      started_at: status === "doing" ? now : null,
    })
    .select(TASK_SELECT)
    .single();

  if (error) {
    throw error;
  }

  const task = data as TaskWithRelations;
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

  const previous = existing as TaskWithRelations;
  const nextStatus = input.status ?? previous.status;
  const nextAssignee = normalizeAssignee({
    assigneeType: input.assigneeType ?? previous.assignee_type,
    botId: input.assigneeType
      ? input.botId
      : input.botId === undefined
        ? previous.bot_id
        : input.botId,
  });

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

  const task = data as TaskWithRelations;
  const webhookError = await maybeFireWebhook(task, previous);
  return { task, webhookError };
}

export async function moveTask(
  taskId: string,
  status: TaskStatus
): Promise<{ task: TaskWithRelations; webhookError: string | null }> {
  return updateTask(taskId, { status });
}

export async function deleteTask(taskId: string): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) {
    throw error;
  }
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

export async function retryTaskWebhook(taskId: string): Promise<{ task: TaskWithRelations; webhookError: string | null }> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("id", taskId)
    .single();

  if (error) {
    throw error;
  }

  const task = data as TaskWithRelations;
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

  const { data: refreshed } = await supabase
    .from("tasks")
    .select(TASK_SELECT)
    .eq("id", taskId)
    .single();

  return {
    task: (refreshed as TaskWithRelations) ?? task,
    webhookError,
  };
}
