"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth";
import {
  addTaskDependency,
  archiveTask,
  createTask,
  listTaskEvents,
  moveTask,
  removeTaskDependency,
  retryTaskWebhook,
  unarchiveTask,
  updateTask,
} from "@/lib/data";
import { DependencyBlockError, DuplicateTaskError } from "@/lib/errors";
import { isShortBody } from "@/lib/task-rules";
import type { ActionResult, AssigneeType, Priority, TaskEvent, TaskStatus } from "@/lib/types";

function revalidateBoard(slug?: string | null) {
  revalidatePath("/", "layout");
  if (slug) {
    revalidatePath(`/projects/${slug}`);
  }
}

function readAssignee(formData: FormData): { assigneeType: AssigneeType; botId: string | null } {
  const assigneeType = String(formData.get("assigneeType") ?? "human") as AssigneeType;
  const botId = String(formData.get("botId") ?? "") || null;
  return { assigneeType, botId };
}

function fail(error: unknown, fallback: string): ActionResult {
  if (error instanceof DuplicateTaskError) {
    return { ok: false, error: error.message, code: "duplicates", duplicates: error.matches };
  }
  if (error instanceof DependencyBlockError) {
    return { ok: false, error: error.message, code: "blocked", blockers: error.blockers };
  }
  return { ok: false, error: error instanceof Error ? error.message : fallback };
}

export async function createTaskAction(formData: FormData): Promise<ActionResult> {
  await requireSession();

  const projectId = String(formData.get("projectId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "");
  if (!projectId || !title) {
    return { ok: false, error: "El título es obligatorio." };
  }

  try {
    const { webhookError } = await createTask({
      projectId,
      title,
      description: description || null,
      priority: (String(formData.get("priority") ?? "") || null) as Priority | null,
      dueAt: String(formData.get("dueAt") ?? "") || null,
      forceCreate: String(formData.get("forceCreate") ?? "") === "1",
      ...readAssignee(formData),
    });
    revalidateBoard(slug);
    return {
      ok: true,
      webhookError,
      bodyWarning: isShortBody(description)
        ? "La tarea se ha creado, pero el cuerpo es corto. Completa por qué, DoD, pasos y enlaces."
        : undefined,
    };
  } catch (error) {
    return fail(error, "No se pudo crear la tarea.");
  }
}

export async function updateTaskAction(formData: FormData): Promise<ActionResult> {
  await requireSession();

  const taskId = String(formData.get("taskId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!taskId || !title) {
    return { ok: false, error: "El título es obligatorio." };
  }

  try {
    const { webhookError } = await updateTask(taskId, {
      title,
      description: String(formData.get("description") ?? "") || null,
      status: (String(formData.get("status") ?? "") || undefined) as TaskStatus | undefined,
      priority: (String(formData.get("priority") ?? "") || null) as Priority | null,
      dueAt: String(formData.get("dueAt") ?? "") || null,
      overrideStart: String(formData.get("overrideStart") ?? "") === "1",
      ...readAssignee(formData),
    });
    revalidateBoard(slug);
    return { ok: true, webhookError };
  } catch (error) {
    return fail(error, "No se pudo guardar la tarea.");
  }
}

export async function moveTaskAction(
  taskId: string,
  status: TaskStatus,
  slug?: string,
  options?: { overrideStart?: boolean }
): Promise<ActionResult> {
  await requireSession();

  try {
    const { webhookError } = await moveTask(taskId, status, options);
    revalidateBoard(slug);
    return { ok: true, webhookError };
  } catch (error) {
    return fail(error, "No se pudo mover la tarea.");
  }
}

export async function updateTaskPriorityAction(
  taskId: string,
  priority: Priority | null,
  slug?: string
): Promise<ActionResult> {
  await requireSession();

  try {
    await updateTask(taskId, { priority });
    revalidateBoard(slug);
    return { ok: true };
  } catch (error) {
    return fail(error, "No se pudo cambiar la prioridad.");
  }
}

export async function archiveTaskAction(formData: FormData): Promise<ActionResult> {
  await requireSession();

  const taskId = String(formData.get("taskId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  if (!taskId) {
    return { ok: false, error: "Falta la tarea." };
  }

  try {
    await archiveTask(taskId);
    revalidateBoard(slug);
    return { ok: true };
  } catch (error) {
    return fail(error, "No se pudo archivar la tarea.");
  }
}

export async function unarchiveTaskAction(formData: FormData): Promise<ActionResult> {
  await requireSession();

  const taskId = String(formData.get("taskId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  if (!taskId) {
    return { ok: false, error: "Falta la tarea." };
  }

  try {
    await unarchiveTask(taskId);
    revalidateBoard(slug);
    return { ok: true };
  } catch (error) {
    return fail(error, "No se pudo restaurar la tarea.");
  }
}

export async function addDependencyAction(formData: FormData): Promise<ActionResult> {
  await requireSession();

  const blockerTaskId = String(formData.get("blockerTaskId") ?? "");
  const blockedTaskId = String(formData.get("blockedTaskId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  if (!blockerTaskId || !blockedTaskId) {
    return { ok: false, error: "Faltan las tareas de la dependencia." };
  }

  try {
    await addTaskDependency(blockerTaskId, blockedTaskId);
    revalidateBoard(slug);
    return { ok: true };
  } catch (error) {
    return fail(error, "No se pudo añadir la dependencia.");
  }
}

export async function removeDependencyAction(formData: FormData): Promise<ActionResult> {
  await requireSession();

  const blockerTaskId = String(formData.get("blockerTaskId") ?? "");
  const blockedTaskId = String(formData.get("blockedTaskId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  if (!blockerTaskId || !blockedTaskId) {
    return { ok: false, error: "Faltan las tareas de la dependencia." };
  }

  try {
    await removeTaskDependency(blockerTaskId, blockedTaskId);
    revalidateBoard(slug);
    return { ok: true };
  } catch (error) {
    return fail(error, "No se pudo quitar la dependencia.");
  }
}

export async function retryWebhookAction(taskId: string, slug?: string): Promise<ActionResult> {
  await requireSession();

  try {
    const { webhookError } = await retryTaskWebhook(taskId);
    revalidateBoard(slug);
    return { ok: true, webhookError };
  } catch (error) {
    return fail(error, "No se pudo reintentar el webhook.");
  }
}

export async function loadTaskEventsAction(taskId: string): Promise<TaskEvent[]> {
  await requireSession();
  return listTaskEvents(taskId);
}
