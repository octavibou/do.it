"use client";

import { useState } from "react";
import { toast } from "sonner";

import {
  archiveTaskAction,
  createTaskAction,
  unarchiveTaskAction,
  updateTaskAction,
} from "@/app/actions/tasks";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { TaskActivity } from "@/components/task-activity";
import { TaskDependencies } from "@/components/task-dependencies";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ASSIGNEE_LABELS, INBOX_GATE_COPY, PRIORITY_LABELS, PRIORITY_ORDER, STATUS_LABELS } from "@/lib/labels";
import { BODY_PLACEHOLDER, fromDatetimeLocalValue, isShortBody, toDatetimeLocalValue } from "@/lib/task-rules";
import type { ActionResult, Bot, DuplicateCandidate, Priority, TaskStatus, TaskWithRelations } from "@/lib/types";

export function TaskForm({
  projectId,
  slug,
  bots,
  tasks = [],
  task,
  onDone,
  onUseExisting,
}: {
  projectId: string;
  slug: string;
  bots: Bot[];
  tasks?: TaskWithRelations[];
  task?: TaskWithRelations;
  onDone?: () => void;
  onUseExisting?: (taskId: string) => void;
}) {
  const [assigneeType, setAssigneeType] = useState(task?.assignee_type ?? "human");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "inbox");
  const [priority, setPriority] = useState<Priority | "">(task?.priority ?? "");
  const [botId, setBotId] = useState(task?.bot_id ?? bots[0]?.id ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [pending, setPending] = useState(false);
  const [duplicates, setDuplicates] = useState<DuplicateCandidate[]>([]);
  const [forceCreate, setForceCreate] = useState(false);
  const [overrideStart, setOverrideStart] = useState(false);
  const [blockers, setBlockers] = useState<DuplicateCandidate[]>([]);
  const [inboxConfirm, setInboxConfirm] = useState(false);
  const [shortConfirm, setShortConfirm] = useState(false);
  const [queuedSubmit, setQueuedSubmit] = useState<FormData | null>(null);

  function applyCommon(formData: FormData) {
    formData.set("projectId", projectId);
    formData.set("slug", slug);
    formData.set("assigneeType", assigneeType);
    formData.set("priority", priority);
    formData.set("botId", assigneeType === "bot" ? botId : "");
    formData.set("dueAt", fromDatetimeLocalValue(String(formData.get("dueLocal") ?? "")) ?? "");
    if (task) {
      formData.set("taskId", task.id);
      formData.set("status", status);
    }
    if (forceCreate) {
      formData.set("forceCreate", "1");
    }
    if (overrideStart) {
      formData.set("overrideStart", "1");
    }
  }

  async function submit(formData: FormData) {
    setPending(true);
    applyCommon(formData);
    const result = task ? await updateTaskAction(formData) : await createTaskAction(formData);
    setPending(false);
    handleResult(result);
  }

  function handleResult(result: ActionResult) {
    if (!result.ok) {
      if (result.code === "duplicates") {
        setDuplicates(result.duplicates ?? []);
        return;
      }
      if (result.code === "blocked") {
        setBlockers(result.blockers ?? []);
        toast.error(result.error);
        return;
      }
      toast.error(result.error);
      return;
    }

    if (result.bodyWarning) {
      toast.warning(result.bodyWarning);
    }
    if (result.webhookError) {
      toast.error(result.webhookError);
    } else if (!result.bodyWarning) {
      toast.success(task ? "Tarea guardada" : "Tarea creada");
    } else {
      toast.success(task ? "Tarea guardada" : "Tarea creada");
    }
    onDone?.();
  }

  async function onSubmit(formData: FormData) {
    const nextDescription = String(formData.get("description") ?? "");
    if (!task && !forceCreate && isShortBody(nextDescription) && !shortConfirm) {
      setQueuedSubmit(formData);
      setShortConfirm(true);
      return;
    }
    if (task && task.status === "inbox" && status !== "inbox") {
      setQueuedSubmit(formData);
      setInboxConfirm(true);
      return;
    }
    await submit(formData);
  }

  async function onArchive(formData: FormData) {
    if (!task) {
      return;
    }
    setPending(true);
    formData.set("taskId", task.id);
    formData.set("slug", slug);
    const result = task.archived_at ? await unarchiveTaskAction(formData) : await archiveTaskAction(formData);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success(task.archived_at ? "Tarea restaurada" : "Tarea archivada");
    onDone?.();
  }

  return (
    <>
      <form action={onSubmit} className="grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="title">Título</Label>
          <Input
            id="title"
            name="title"
            required
            defaultValue={task?.title}
            placeholder="Nombre corto y accionable"
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="description">Cuerpo</Label>
          <Textarea
            id="description"
            name="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder={BODY_PLACEHOLDER}
            rows={10}
            className="min-h-48 font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Markdown bienvenido. Estructura: por qué / objetivo DoD / pasos / deps / enlaces.
            {isShortBody(description) ? " Cuerpo corto: no bloquea, pero conviene completarlo." : null}
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {task ? (
            <div className="grid gap-2">
              <Label>Estado</Label>
              <Select value={status} onValueChange={(value) => setStatus(value as TaskStatus)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="grid gap-2">
              <Label>Estado</Label>
              <p className="rounded-lg bg-muted/60 px-3 py-2 text-sm">Bandeja (por defecto)</p>
              <p className="text-xs text-muted-foreground">{INBOX_GATE_COPY}</p>
            </div>
          )}
          <div className="grid gap-2">
            <Label>Prioridad</Label>
            <Select
              value={priority || "none"}
              onValueChange={(value) => setPriority(value === "none" ? "" : (value as Priority))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Sin prioridad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin prioridad</SelectItem>
                {PRIORITY_ORDER.map((value) => (
                  <SelectItem key={value} value={value}>
                    {PRIORITY_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="dueLocal">Fecha límite</Label>
            <Input
              id="dueLocal"
              name="dueLocal"
              type="datetime-local"
              defaultValue={toDatetimeLocalValue(task?.due_at)}
            />
            <p className="text-xs text-muted-foreground">No mueve el estado sola.</p>
          </div>
          <div className="grid gap-2">
            <Label>Asignado</Label>
            <Select
              value={assigneeType}
              onValueChange={(value) => setAssigneeType(value as "human" | "bot")}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(ASSIGNEE_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {assigneeType === "bot" ? (
          <div className="grid gap-2">
            <Label>Bot</Label>
            <Select value={botId} onValueChange={setBotId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Elige bot" />
              </SelectTrigger>
              <SelectContent>
                {bots.map((bot) => (
                  <SelectItem key={bot.id} value={bot.id}>
                    {bot.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {duplicates.length > 0 ? (
          <div className="grid gap-2 rounded-xl bg-muted/60 p-3">
            <p className="text-sm font-medium">Hay tareas parecidas</p>
            <ul className="grid gap-2">
              {duplicates.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-2 text-sm">
                  <span>
                    {item.title}{" "}
                    <span className="text-muted-foreground">({STATUS_LABELS[item.status]})</span>
                  </span>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    onClick={() => onUseExisting?.(item.id)}
                  >
                    Usar existente
                  </Button>
                </li>
              ))}
            </ul>
            <Button type="button" variant="ghost" size="sm" onClick={() => setForceCreate(true)}>
              Crear de todas formas
            </Button>
            {forceCreate ? (
              <p className="text-xs text-muted-foreground">
                Pulsa otra vez «Crear tarea» para confirmar el duplicado.
              </p>
            ) : null}
          </div>
        ) : null}
        {blockers.length > 0 ? (
          <div className="grid gap-2 rounded-xl bg-muted/60 p-3">
            <p className="text-sm font-medium">Bloqueadores sin terminar</p>
            <ul className="text-sm text-muted-foreground">
              {blockers.map((item) => (
                <li key={item.id}>
                  {item.title} ({STATUS_LABELS[item.status]})
                </li>
              ))}
            </ul>
            <Button type="button" variant="outline" size="sm" onClick={() => setOverrideStart(true)}>
              Forzar inicio (override)
            </Button>
            {overrideStart ? (
              <p className="text-xs text-muted-foreground">
                Pulsa «Guardar» para forzar el paso a En curso. Quedará en la auditoría.
              </p>
            ) : null}
          </div>
        ) : null}
        {task ? <TaskDependencies task={task} tasks={tasks} slug={slug} /> : null}
        {task ? <TaskActivity taskId={task.id} /> : null}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {task ? (
            <Button formAction={onArchive} type="submit" variant="destructive" disabled={pending}>
              {task.archived_at ? "Restaurar" : "Archivar"}
            </Button>
          ) : (
            <span />
          )}
          <Button type="submit" disabled={pending}>
            {task ? "Guardar" : "Crear tarea"}
          </Button>
        </div>
      </form>
      <ConfirmDialog
        open={inboxConfirm}
        title="Empezar / Mover"
        description={`${INBOX_GATE_COPY} Vas a sacar esta tarea de Bandeja.`}
        confirmLabel="Empezar / Mover"
        pending={pending}
        onOpenChange={setInboxConfirm}
        onConfirm={async () => {
          setInboxConfirm(false);
          if (queuedSubmit) {
            await submit(queuedSubmit);
            setQueuedSubmit(null);
          }
        }}
      />
      <ConfirmDialog
        open={shortConfirm}
        title="Cuerpo corto"
        description="El cuerpo tiene menos de 40 caracteres. Puedes crear igual, pero conviene rellenar por qué, DoD, pasos y enlaces."
        confirmLabel="Crear de todas formas"
        pending={pending}
        onOpenChange={setShortConfirm}
        onConfirm={async () => {
          setShortConfirm(false);
          if (queuedSubmit) {
            await submit(queuedSubmit);
            setQueuedSubmit(null);
          }
        }}
      />
    </>
  );
}
