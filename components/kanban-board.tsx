"use client";

import { useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { moveTaskAction } from "@/app/actions/tasks";
import { TaskCard } from "@/components/task-card";
import { TaskForm } from "@/components/task-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { STATUS_LABELS, STATUS_ORDER } from "@/lib/labels";
import { cn } from "@/lib/utils";
import type { Bot, TaskStatus, TaskWithRelations } from "@/lib/types";

function Column({
  status,
  tasks,
  slug,
  bots,
}: {
  status: TaskStatus;
  tasks: TaskWithRelations[];
  slug: string;
  bots: Bot[];
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <section
      ref={setNodeRef}
      className={cn(
        "flex min-h-72 w-[min(100%,20rem)] shrink-0 flex-col rounded-2xl bg-muted/60 p-3 md:w-auto",
        isOver && "ring-2 ring-foreground/30",
        status === "doing" && "bg-muted"
      )}
    >
      <header className="mb-3 flex items-center justify-between px-1">
        <h2 className="text-sm font-medium">{STATUS_LABELS[status]}</h2>
        <span className="text-xs text-muted-foreground">{tasks.length}</span>
      </header>
      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <div className="flex flex-1 flex-col gap-2">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} slug={slug} bots={bots} />
          ))}
        </div>
      </SortableContext>
    </section>
  );
}

export function KanbanBoard({
  slug,
  projectId,
  projectName,
  bots,
  tasks,
}: {
  slug: string;
  projectId: string;
  projectName: string;
  bots: Bot[];
  tasks: TaskWithRelations[];
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } })
  );

  const grouped = useMemo(() => {
    const map = Object.fromEntries(STATUS_ORDER.map((status) => [status, [] as TaskWithRelations[]])) as Record<
      TaskStatus,
      TaskWithRelations[]
    >;
    for (const task of tasks) {
      map[task.status].push(task);
    }
    return map;
  }, [tasks]);

  const activeTask = tasks.find((task) => task.id === activeId) ?? null;

  function onDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  async function onDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const overId = event.over?.id;
    if (!overId) {
      return;
    }

    const task = tasks.find((item) => item.id === String(event.active.id));
    if (!task) {
      return;
    }

    const overAsStatus = STATUS_ORDER.includes(String(overId) as TaskStatus)
      ? (String(overId) as TaskStatus)
      : tasks.find((item) => item.id === String(overId))?.status;

    if (!overAsStatus || overAsStatus === task.status) {
      return;
    }

    const result = await moveTaskAction(task.id, overAsStatus, slug);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.webhookError) {
      toast.error(result.webhookError);
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Proyecto</p>
          <h1 className="text-2xl font-medium tracking-tight">{projectName}</h1>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="size-4" />
              Nueva tarea
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Nueva tarea</DialogTitle>
              <DialogDescription>
                Si la dejas en En curso y el asignado es un bot, se dispara su webhook.
              </DialogDescription>
            </DialogHeader>
            <TaskForm
              projectId={projectId}
              slug={slug}
              bots={bots}
              onDone={() => setCreateOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:grid md:grid-cols-4 md:overflow-visible md:px-0">
          {STATUS_ORDER.map((status) => (
            <Column
              key={status}
              status={status}
              tasks={grouped[status]}
              slug={slug}
              bots={bots}
            />
          ))}
        </div>
        <DragOverlay>
          {activeTask ? (
            <div className="rounded-xl bg-background p-3 text-sm font-medium shadow-lg ring-1 ring-foreground/10">
              {activeTask.title}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
