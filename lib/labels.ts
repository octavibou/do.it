import type { TaskSortMode } from "@/lib/task-rules";
import type { AssigneeType, Priority, TaskEventAction, TaskStatus } from "@/lib/types";

export const STATUS_LABELS: Record<TaskStatus, string> = {
  inbox: "Bandeja",
  doing: "En curso",
  review: "Revisión",
  done: "Hecho",
};

export const STATUS_ORDER: TaskStatus[] = ["inbox", "doing", "review", "done"];

export const ASSIGNEE_LABELS: Record<AssigneeType, string> = {
  human: "Humano",
  bot: "Bot",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  urgent: "urgente",
  high: "alta",
  medium: "normal",
  low: "baja",
};

export const PRIORITY_ORDER: Priority[] = ["urgent", "high", "medium", "low"];

export const TASK_SORT_LABELS: Record<TaskSortMode, string> = {
  priority: "Por prioridad",
  created_desc: "Por creación (más recientes primero)",
  created_asc: "Por creación (más antiguas primero)",
};

export const EVENT_ACTION_LABELS: Record<TaskEventAction, string> = {
  create: "Creación",
  update: "Actualización",
  status_change: "Cambio de estado",
  assignee_change: "Cambio de asignado",
  priority_change: "Cambio de prioridad",
  archive: "Archivo",
  dependency: "Dependencia",
  webhook: "Webhook",
  override_start: "Override de inicio",
};

export const INBOX_GATE_COPY =
  "El estado no se mueve por urgencia; urgente ≠ En curso.";

export function nextStatus(status: TaskStatus): TaskStatus | null {
  const index = STATUS_ORDER.indexOf(status);
  return index >= 0 && index < STATUS_ORDER.length - 1
    ? STATUS_ORDER[index + 1]
    : null;
}

export function prevStatus(status: TaskStatus): TaskStatus | null {
  const index = STATUS_ORDER.indexOf(status);
  return index > 0 ? STATUS_ORDER[index - 1] : null;
}

export function formatPriorityLabel(priority: Priority | null | undefined): string {
  return priority ? PRIORITY_LABELS[priority] : "sin prioridad";
}

export function formatAssigneeValue(assigneeType: AssigneeType, botId: string | null): string {
  return assigneeType === "bot" ? `bot:${botId ?? "?"}` : "human";
}
