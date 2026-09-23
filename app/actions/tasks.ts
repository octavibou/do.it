"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth";
import {
  createTask,
  deleteTask,
  moveTask,
  retryTaskWebhook,
  updateTask,
} from "@/lib/data";
import type { ActionResult, AssigneeType, Priority, TaskStatus } from "@/lib/types";

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

export async function createTaskAction(formData: FormData): Promise<ActionResult> {
  await requireSession();

  const projectId = String(formData.get("projectId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  if (!projectId || !title) {
    return { ok: false, error: "El título es obligatorio." };
  }

  try {
    const { webhookError } = await createTask({
      projectId,
      title,
      description: String(formData.get("description") ?? "") || null,
      status: (String(formData.get("status") ?? "inbox") || "inbox") as TaskStatus,
      priority: (String(formData.get("priority") ?? "") || null) as Priority | null,
      ...readAssignee(formData),
    });
    revalidateBoard(slug);
    return { ok: true, webhookError };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo crear la tarea." };
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
      ...readAssignee(formData),
    });
    revalidateBoard(slug);
    return { ok: true, webhookError };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo guardar la tarea." };
  }
}

export async function moveTaskAction(
  taskId: string,
  status: TaskStatus,
  slug?: string
): Promise<ActionResult> {
  await requireSession();

  try {
    const { webhookError } = await moveTask(taskId, status);
    revalidateBoard(slug);
    return { ok: true, webhookError };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo mover la tarea." };
  }
}

export async function deleteTaskAction(formData: FormData): Promise<ActionResult> {
  await requireSession();

  const taskId = String(formData.get("taskId") ?? "");
  const slug = String(formData.get("slug") ?? "");
  if (!taskId) {
    return { ok: false, error: "Falta la tarea." };
  }

  try {
    await deleteTask(taskId);
    revalidateBoard(slug);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo borrar la tarea." };
  }
}

export async function retryWebhookAction(taskId: string, slug?: string): Promise<ActionResult> {
  await requireSession();

  try {
    const { webhookError } = await retryTaskWebhook(taskId);
    revalidateBoard(slug);
    return { ok: true, webhookError };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo reintentar el webhook." };
  }
}
