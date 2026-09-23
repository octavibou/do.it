import type { AssigneeType, Priority, TaskStatus } from "@/lib/types";

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
  low: "Baja",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente",
};

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
