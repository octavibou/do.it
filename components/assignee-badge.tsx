import { Badge } from "@/components/ui/badge";
import { ASSIGNEE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { AssigneeType } from "@/lib/types";

export function AssigneeBadge({
  type,
  botName,
}: {
  type: AssigneeType;
  botName?: string | null;
}) {
  if (type === "bot") {
    return (
      <Badge
        variant="outline"
        className={cn(
          "border-transparent bg-sky-600 text-white dark:bg-sky-500"
        )}
      >
        {botName ? `Bot · ${botName}` : "Bot"}
      </Badge>
    );
  }

  return (
    <Badge variant="secondary">{ASSIGNEE_LABELS.human}</Badge>
  );
}
