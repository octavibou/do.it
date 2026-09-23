import { Calendar } from "lucide-react";

import { cn } from "@/lib/utils";
import { formatDueAt, isOverdue } from "@/lib/task-rules";
import type { TaskStatus } from "@/lib/types";

export function DueBadge({
  dueAt,
  status,
}: {
  dueAt: string | null;
  status?: TaskStatus;
}) {
  if (!dueAt) {
    return null;
  }

  const overdue = isOverdue(dueAt, status);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs text-muted-foreground",
        overdue && "text-red-600 dark:text-red-400"
      )}
    >
      <Calendar className="size-3" />
      {overdue ? `Vencida · ${formatDueAt(dueAt)}` : formatDueAt(dueAt)}
    </span>
  );
}
