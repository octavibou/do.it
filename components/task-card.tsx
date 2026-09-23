"use client";

/* eslint-disable react-hooks/refs -- @dnd-kit exposes node refs and listeners for render */
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronLeft, ChevronRight, GripVertical, Lock } from "lucide-react";
import { toast } from "sonner";

import { retryWebhookAction, updateTaskPriorityAction } from "@/app/actions/tasks";
import { AssigneeBadge } from "@/components/assignee-badge";
import { CreatedBadge } from "@/components/created-badge";
import { DueBadge } from "@/components/due-badge";
import { PriorityBadge } from "@/components/priority-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { nextStatus, prevStatus, PRIORITY_LABELS, PRIORITY_ORDER, STATUS_LABELS } from "@/lib/labels";
import { incompleteBlockers } from "@/lib/task-rules";
import { cn } from "@/lib/utils";
import type { Priority, TaskWithRelations } from "@/lib/types";

export function TaskCard({
  task,
  slug,
  dragDisabled = false,
  onOpen,
  onRequestMove,
}: {
  task: TaskWithRelations;
  slug: string;
  dragDisabled?: boolean;
  onOpen?: () => void;
  onRequestMove?: (task: TaskWithRelations, status: TaskWithRelations["status"]) => void;
}) {
  const sortable = useSortable({ id: task.id, disabled: dragDisabled });
  const blocked = incompleteBlockers(task.blocked_by);
  const back = prevStatus(task.status);
  const forward = nextStatus(task.status);

  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };

  async function retry() {
    const result = await retryWebhookAction(task.id, slug);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.webhookError) {
      toast.error(result.webhookError);
      return;
    }
    toast.success("Webhook reenviado");
  }

  async function changePriority(value: string) {
    const priority = value === "none" ? null : (value as Priority);
    const result = await updateTaskPriorityAction(task.id, priority, slug);
    if (!result.ok) {
      toast.error(result.error);
    }
  }

  return (
    <article
      ref={sortable.setNodeRef}
      style={style}
      className={cn(
        "rounded-xl bg-background p-3 ring-1 ring-foreground/10",
        sortable.isDragging && "opacity-60",
        task.archived_at && "opacity-70"
      )}
    >
      <div className="flex items-start gap-2">
        {dragDisabled ? null : (
          <button
            type="button"
            className="mt-0.5 hidden cursor-grab text-muted-foreground md:block"
            aria-label="Arrastrar"
            {...sortable.attributes}
            {...sortable.listeners}
          >
            <GripVertical className="size-4" />
          </button>
        )}
        <button type="button" className="min-w-0 flex-1 text-left" onClick={onOpen}>
          <h3 className="text-sm font-medium leading-snug">{task.title}</h3>
          {task.description ? (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{task.description}</p>
          ) : null}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <AssigneeBadge type={task.assignee_type} botName={task.bot?.name} />
        <PriorityBadge priority={task.priority} />
        <CreatedBadge createdAt={task.created_at} />
        <DueBadge dueAt={task.due_at} status={task.status} />
        {blocked.length > 0 ? (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="size-3" />
            Bloqueada
          </span>
        ) : null}
      </div>
      <div className="mt-2">
        <Select value={task.priority ?? "none"} onValueChange={changePriority}>
          <SelectTrigger size="sm" className="h-7 w-full text-xs">
            <SelectValue placeholder="Prioridad" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">sin prioridad</SelectItem>
            {PRIORITY_ORDER.map((value) => (
              <SelectItem key={value} value={value}>
                {PRIORITY_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {task.webhook_error ? (
        <Alert variant="destructive" className="mt-2">
          <AlertDescription>
            {task.webhook_error}
            <Button type="button" variant="ghost" size="xs" className="mt-1" onClick={retry}>
              Reintentar webhook
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="mt-3 flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={!back || !onRequestMove}
          onClick={() => back && onRequestMove?.(task, back)}
        >
          <ChevronLeft className="size-3.5" />
          {back ? STATUS_LABELS[back] : "—"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="xs"
          disabled={!forward || !onRequestMove}
          onClick={() => forward && onRequestMove?.(task, forward)}
        >
          {forward ? STATUS_LABELS[forward] : "—"}
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </article>
  );
}
