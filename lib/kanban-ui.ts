import { cn } from "cn";

import type { TaskStatus } from "@/lib/types";

export function isDoneColumn(status: TaskStatus): boolean {
  return status === "done";
}

export function kanbanColumnClassName(
  status: TaskStatus,
  options?: { isOver?: boolean; className?: string }
): string {
  return cn(
    "flex min-h-72 w-[min(100%,20rem)] shrink-0 flex-col rounded-2xl bg-muted/60 p-3 md:w-auto",
    status === "doing" && "bg-muted",
    status === "done" &&
      "bg-emerald-50/90 p-2 ring-1 ring-emerald-200/70 dark:bg-emerald-950/35 dark:ring-emerald-800/50",
    options?.isOver && "ring-2 ring-foreground/30",
    options?.className
  );
}

export function taskCardClassName(options: {
  compact?: boolean;
  isDragging?: boolean;
  archived?: boolean;
  className?: string;
}): string {
  return cn(
    "rounded-xl bg-background p-3 ring-1 ring-foreground/10",
    options.compact &&
      "min-w-0 rounded-lg bg-background/90 px-2 py-1 ring-emerald-200/80 dark:bg-background/55 dark:ring-emerald-800/50",
    options.isDragging && "opacity-60",
    options.archived && "opacity-70",
    options.className
  );
}
