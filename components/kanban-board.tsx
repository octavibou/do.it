"use client";

import dynamic from "next/dynamic";
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

import { loadArchivedTasksAction } from "@/app/actions/tasks";
import { TaskCard } from "@/components/task-card";
import { useStatusMove } from "@/components/status-move";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isDoneColumn, kanbanColumnClassName } from "@/lib/kanban-ui";
import { INBOX_GATE_COPY, STATUS_LABELS, STATUS_ORDER, TASK_SORT_LABELS } from "@/lib/labels";
import { isDueThisWeek, isOverdue, sortTasks, TASK_SORT_MODES, type TaskSortMode } from "@/lib/task-rules";
import { cn } from "@/lib/utils";
import type { Bot, TaskStatus, TaskWithRelations } from "@/lib/types";

const TaskForm = dynamic(
  () => import("@/components/task-form").then((mod) => mod.TaskForm),
  {
    loading: () => <p className="text-sm text-muted-foreground">Cargando formulario…</p>,
  }
);

type DueFilter = "all" | "overdue" | "week" | "none";

function Column({
  status,
  tasks,
  slug,
  onOpen,
  onRequestMove,
}: {
  status: TaskStatus;
  tasks: TaskWithRelations[];
  slug: string;
  onOpen: (task: TaskWithRelations) => void;
  onRequestMove: (task: TaskWithRelations, next: TaskStatus) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const compact = isDoneColumn(status);

  return (
    <section
      ref={setNodeRef}
      className={kanbanColumnClassName(status, { isOver })}
    >
      <header className={cn("mb-3 flex items-center justify-between px-1", compact && "mb-2")}>
        <h2 className="text-sm font-medium">{STATUS_LABELS[status]}</h2>
        <span className="text-xs text-muted-foreground">{tasks.length}</span>
      </header>
      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <div className={cn("flex flex-1 flex-col gap-2", compact && "gap-1")}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              slug={slug}
              compact={compact}
              onOpen={() => onOpen(task)}
              onRequestMove={onRequestMove}
            />
          ))}
        </div>
      </SortableContext>
    </section>
  );
}

function matchesDueFilter(task: TaskWithRelations, filter: DueFilter): boolean {
  if (filter === "all") {
    return true;
  }
  if (filter === "none") {
    return !task.due_at;
  }
  if (filter === "overdue") {
    return isOverdue(task.due_at, task.status);
  }
  return isDueThisWeek(task.due_at);
}

export function KanbanBoard({
  slug,
  projectId,
  projectName,
  bots,
  tasks,
  archivedCount,
}: {
  slug: string;
  projectId: string;
  projectName: string;
  bots: Bot[];
  tasks: TaskWithRelations[];
  archivedCount: number;
}) {
  const [createOpen, setCreateOpen] = useState(false);
  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [archivedTasks, setArchivedTasks] = useState<TaskWithRelations[] | null>(null);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [dueFilter, setDueFilter] = useState<DueFilter>("all");
  const [sortMode, setSortMode] = useState<TaskSortMode>("priority");
  const { requestMove, dialogs } = useStatusMove(slug);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } })
  );

  const sourceTasks = showArchived ? (archivedTasks ?? []) : tasks;

  const visible = useMemo(() => {
    return sortTasks(
      sourceTasks.filter((task) => matchesDueFilter(task, dueFilter)),
      sortMode
    );
  }, [dueFilter, sortMode, sourceTasks]);

  const grouped = useMemo(() => {
    const map = Object.fromEntries(STATUS_ORDER.map((status) => [status, [] as TaskWithRelations[]])) as Record<
      TaskStatus,
      TaskWithRelations[]
    >;
    for (const task of visible) {
      map[task.status].push(task);
    }
    return map;
  }, [visible]);

  const formTasks = archivedTasks ? [...tasks, ...archivedTasks] : tasks;
  const activeTask = sourceTasks.find((task) => task.id === activeId) ?? null;
  const editTask = formTasks.find((task) => task.id === editTaskId) ?? null;

  async function toggleArchived() {
    const next = !showArchived;
    if (next && archivedTasks === null) {
      setShowArchived(true);
      setArchivedLoading(true);
      const result = await loadArchivedTasksAction(projectId);
      setArchivedLoading(false);
      if (!result.ok) {
        toast.error(result.error);
        setShowArchived(false);
        return;
      }
      setArchivedTasks(result.tasks);
      return;
    }
    setShowArchived(next);
  }

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
    if (!task || task.archived_at) {
      return;
    }

    const overAsStatus = STATUS_ORDER.includes(String(overId) as TaskStatus)
      ? (String(overId) as TaskStatus)
      : tasks.find((item) => item.id === String(overId))?.status;

    if (!overAsStatus || overAsStatus === task.status) {
      return;
    }

    await requestMove(task, overAsStatus);
  }

  function openExisting(taskId: string) {
    setCreateOpen(false);
    setEditTaskId(taskId);
  }

  return (
    <div className="flex flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Proyecto</p>
          <h1 className="text-2xl font-medium tracking-tight">{projectName}</h1>
          <p className="mt-1 max-w-xl text-xs text-muted-foreground">{INBOX_GATE_COPY}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={dueFilter} onValueChange={(value) => setDueFilter(value as DueFilter)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Fecha" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas las fechas</SelectItem>
              <SelectItem value="overdue">Vencidas</SelectItem>
              <SelectItem value="week">Esta semana</SelectItem>
              <SelectItem value="none">Sin fecha</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sortMode} onValueChange={(value) => setSortMode(value as TaskSortMode)}>
            <SelectTrigger className="w-[17.5rem]" aria-label="Ordenar tarjetas">
              <SelectValue placeholder="Orden" />
            </SelectTrigger>
            <SelectContent>
              {TASK_SORT_MODES.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {TASK_SORT_LABELS[mode]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant={showArchived ? "default" : "outline"}
            onClick={() => void toggleArchived()}
            disabled={archivedLoading}
          >
            {archivedLoading ? "Cargando archivadas…" : `Archivadas (${archivedCount})`}
          </Button>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" />
                Nueva tarea
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
              <DialogHeader>
                <DialogTitle>Nueva tarea</DialogTitle>
                <DialogDescription>
                  Entra en Bandeja. El webhook solo se dispara al pasar a En curso con un bot.
                </DialogDescription>
              </DialogHeader>
              <TaskForm
                projectId={projectId}
                slug={slug}
                bots={bots}
                tasks={formTasks}
                onDone={() => setCreateOpen(false)}
                onUseExisting={openExisting}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>
      {showArchived ? (
        <section className="grid gap-2">
          <h2 className="text-sm font-medium">Archivadas</h2>
          {archivedLoading ? (
            <p className="text-sm text-muted-foreground">Cargando archivadas…</p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay tareas archivadas con este filtro.</p>
          ) : (
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {visible.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  slug={slug}
                  dragDisabled
                  onOpen={() => setEditTaskId(task.id)}
                />
              ))}
            </div>
          )}
        </section>
      ) : (
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
                onOpen={(task) => setEditTaskId(task.id)}
                onRequestMove={requestMove}
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
      )}
      <Dialog open={Boolean(editTask)} onOpenChange={(open) => !open && setEditTaskId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar tarea</DialogTitle>
            <DialogDescription>
              Prioridad, fecha, dependencias y actividad. {INBOX_GATE_COPY}
            </DialogDescription>
          </DialogHeader>
          {editTask ? (
            <TaskForm
              projectId={projectId}
              slug={slug}
              bots={bots}
              tasks={formTasks}
              task={editTask}
              onDone={() => setEditTaskId(null)}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      {dialogs}
    </div>
  );
}
