import { Badge } from "@/components/ui/badge";
import { PRIORITY_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { Priority } from "@/lib/types";

const ACCENT: Record<Priority, string> = {
  low: "border-border text-muted-foreground",
  medium: "border-border text-foreground",
  high: "border-transparent bg-amber-500 text-black",
  urgent: "border-transparent bg-red-600 text-white",
};

export function PriorityBadge({ priority }: { priority: Priority | null }) {
  if (!priority) {
    return null;
  }

  return (
    <Badge variant="outline" className={cn(ACCENT[priority])}>
      {PRIORITY_LABELS[priority]}
    </Badge>
  );
}
