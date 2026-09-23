import type { Priority, TaskStatus } from "@/lib/types";

export const BODY_PLACEHOLDER = `Por qué:
Objetivo / DoD:
Pasos:
Dependencias:
Enlaces:`;

export const SHORT_BODY_CHARS = 40;

export const PRIORITY_RANK: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export type SortableTask = {
  priority: Priority | null;
  due_at: string | null;
  created_at: string;
  status?: TaskStatus;
};

export type TaskSummary = {
  id: string;
  title: string;
  status: TaskStatus;
  archived_at: string | null;
};

export function isShortBody(description: string | null | undefined): boolean {
  return (description?.trim().length ?? 0) < SHORT_BODY_CHARS;
}

export function incompleteBlockers(blockedBy: TaskSummary[]): TaskSummary[] {
  return blockedBy.filter((task) => task.status !== "done");
}

export function canEnterDoing(blockedBy: TaskSummary[], overrideStart = false): boolean {
  return overrideStart || incompleteBlockers(blockedBy).length === 0;
}

export const TASK_SORT_MODES = ["priority", "created_desc", "created_asc"] as const;
export type TaskSortMode = (typeof TASK_SORT_MODES)[number];

export const MADRID_TIME_ZONE = "Europe/Madrid";

function madridCalendarDay(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: MADRID_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function calendarDaysBetween(from: Date, to: Date): number {
  const fromDay = Date.parse(`${madridCalendarDay(from)}T00:00:00Z`);
  const toDay = Date.parse(`${madridCalendarDay(to)}T00:00:00Z`);
  return Math.round((toDay - fromDay) / 86_400_000);
}

export function compareCreatedAt(a: Pick<SortableTask, "created_at">, b: Pick<SortableTask, "created_at">): number {
  if (a.created_at === b.created_at) {
    return 0;
  }
  return a.created_at < b.created_at ? -1 : 1;
}

export function compareTasks(a: SortableTask, b: SortableTask): number {
  const aRank = a.priority ? PRIORITY_RANK[a.priority] : 4;
  const bRank = b.priority ? PRIORITY_RANK[b.priority] : 4;
  if (aRank !== bRank) {
    return aRank - bRank;
  }

  if (a.due_at && b.due_at && a.due_at !== b.due_at) {
    return a.due_at < b.due_at ? -1 : 1;
  }
  if (a.due_at && !b.due_at) {
    return -1;
  }
  if (!a.due_at && b.due_at) {
    return 1;
  }

  return compareCreatedAt(a, b);
}

export function sortTasks<T extends SortableTask>(tasks: T[], mode: TaskSortMode = "priority"): T[] {
  const copy = [...tasks];
  if (mode === "created_asc") {
    return copy.sort((a, b) => compareCreatedAt(a, b) || compareTasks(a, b));
  }
  if (mode === "created_desc") {
    return copy.sort((a, b) => compareCreatedAt(b, a) || compareTasks(a, b));
  }
  return copy.sort(compareTasks);
}

export function isOverdue(dueAt: string | null | undefined, status?: TaskStatus, now = Date.now()): boolean {
  if (!dueAt || status === "done") {
    return false;
  }
  const due = new Date(dueAt).getTime();
  return !Number.isNaN(due) && due < now;
}

export function isDueThisWeek(dueAt: string | null | undefined, now = new Date()): boolean {
  if (!dueAt) {
    return false;
  }
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) {
    return false;
  }
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return due >= start && due < end;
}

export function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromDatetimeLocalValue(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const date = new Date(trimmed);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function formatDueAt(iso: string, locale = "es-ES"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" });
}

export function formatCreatedAtFull(iso: string, locale = "es-ES"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString(locale, {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: MADRID_TIME_ZONE,
  });
}

export function formatCreatedAt(iso: string, now = Date.now(), locale = "es-ES"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }

  const days = calendarDaysBetween(date, new Date(now));
  if (days === 0) {
    return "hoy";
  }
  if (days === 1) {
    return "ayer";
  }
  if (days > 1 && days < 7) {
    return `hace ${days} días`;
  }

  const createdYear = new Intl.DateTimeFormat("en", {
    timeZone: MADRID_TIME_ZONE,
    year: "numeric",
  }).format(date);
  const nowYear = new Intl.DateTimeFormat("en", {
    timeZone: MADRID_TIME_ZONE,
    year: "numeric",
  }).format(new Date(now));

  return date.toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    year: createdYear === nowYear ? undefined : "numeric",
    timeZone: MADRID_TIME_ZONE,
  });
}
