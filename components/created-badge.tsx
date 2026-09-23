import { Clock } from "lucide-react";

import { formatCreatedAt, formatCreatedAtFull } from "@/lib/task-rules";

export function CreatedBadge({ createdAt }: { createdAt: string }) {
  return (
    <time
      dateTime={createdAt}
      title={formatCreatedAtFull(createdAt)}
      aria-label={`Creada ${formatCreatedAtFull(createdAt)}`}
      suppressHydrationWarning
      className="inline-flex items-center gap-1 text-xs text-muted-foreground"
    >
      <Clock className="size-3" aria-hidden />
      {formatCreatedAt(createdAt)}
    </time>
  );
}
