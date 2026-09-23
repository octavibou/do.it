"use client";

/* eslint-disable react-hooks/refs -- @dnd-kit exposes node refs and listeners for render */
import { useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronLeft, ChevronRight, GripVertical } from "lucide-react";
import { toast } from "sonner";

import { moveTaskAction, retryWebhookAction } from "@/app/actions/tasks";
import { AssigneeBadge } from "@/components/assignee-badge";
import { PriorityBadge } from "@/components/priority-badge";
import { TaskForm } from "@/components/task-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { nextStatus, prevStatus, STATUS_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { Bot, TaskStatus, TaskWithRelations } from "@/lib/types";

export function TaskCard({
  task,
  slug,
  bots,
  dragDisabled = false,
}: {
  task: TaskWithRelations;
  slug: string;
  bots: Bot[];
  dragDisabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const sortable = useSortable({ id: task.id, disabled: dragDisabled });

  const style = {
    transform: CSS.Transform.toString(sortable.transform),
    transition: sortable.transition,
  };

  async function move(status: TaskStatus) {
    setPending(true);
    const result = await moveTaskAction(task.id, status, slug);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.webhookError) {
      toast.error(result.webhookError);
    }
  }

  async function retry() {
    setPending(true);
    const result = await retryWebhookAction(task.id, slug);
    setPending(false);
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

  const back = prevStatus(task.status);
  const forward = nextStatus(task.status);

  return (
    <>
      <article
        ref={sortable.setNodeRef}
        style={style}
        className={cn(
          "rounded-xl bg-background p-3 ring-1 ring-foreground/10",
          sortable.isDragging && "opacity-60"
        )}
      >
        <div className="flex items-start gap-2">
          <button
            type="button"
            className="mt-0.5 hidden cursor-grab text-muted-foreground md:block"
            aria-label="Arrastrar"
            {...sortable.attributes}
            {...sortable.listeners}
          >
            <GripVertical className="size-4" />
          </button>
          <button
            type="button"
            className="min-w-0 flex-1 text-left"
            onClick={() => setOpen(true)}
          >
            <h3 className="text-sm font-medium leading-snug">{task.title}</h3>
            {task.description ? (
              <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {task.description}
              </p>
            ) : null}
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <AssigneeBadge type={task.assignee_type} botName={task.bot?.name} />
          <PriorityBadge priority={task.priority} />
        </div>
        {task.webhook_error ? (
          <Alert variant="destructive" className="mt-2">
            <AlertDescription>
              {task.webhook_error}
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="mt-1"
                disabled={pending}
                onClick={retry}
              >
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
            disabled={!back || pending}
            onClick={() => back && move(back)}
          >
            <ChevronLeft className="size-3.5" />
            {back ? STATUS_LABELS[back] : "—"}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={!forward || pending}
            onClick={() => forward && move(forward)}
          >
            {forward ? STATUS_LABELS[forward] : "—"}
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </article>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar tarea</DialogTitle>
            <DialogDescription>Cambia el asignado, el estado o el texto.</DialogDescription>
          </DialogHeader>
          <TaskForm
            projectId={task.project_id}
            slug={slug}
            bots={bots}
            task={task}
            onDone={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
