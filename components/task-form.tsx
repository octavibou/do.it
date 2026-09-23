"use client";

import { useState } from "react";
import { toast } from "sonner";

import { createTaskAction, deleteTaskAction, updateTaskAction } from "@/app/actions/tasks";
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
import { ASSIGNEE_LABELS, PRIORITY_LABELS, STATUS_LABELS } from "@/lib/labels";
import type { Bot, Priority, TaskStatus, TaskWithRelations } from "@/lib/types";

export function TaskForm({
  projectId,
  slug,
  bots,
  task,
  defaultStatus = "inbox",
  onDone,
}: {
  projectId: string;
  slug: string;
  bots: Bot[];
  task?: TaskWithRelations;
  defaultStatus?: TaskStatus;
  onDone?: () => void;
}) {
  const [assigneeType, setAssigneeType] = useState(task?.assignee_type ?? "human");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? defaultStatus);
  const [priority, setPriority] = useState<Priority | "">(task?.priority ?? "");
  const [botId, setBotId] = useState(task?.bot_id ?? bots[0]?.id ?? "");
  const [pending, setPending] = useState(false);

  async function onSubmit(formData: FormData) {
    setPending(true);
    formData.set("projectId", projectId);
    formData.set("slug", slug);
    formData.set("assigneeType", assigneeType);
    formData.set("status", status);
    formData.set("priority", priority);
    formData.set("botId", assigneeType === "bot" ? botId : "");
    if (task) {
      formData.set("taskId", task.id);
    }

    const result = task ? await updateTaskAction(formData) : await createTaskAction(formData);
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    if (result.webhookError) {
      toast.error(result.webhookError);
    } else {
      toast.success(task ? "Tarea guardada" : "Tarea creada");
    }
    onDone?.();
  }

  async function onDelete(formData: FormData) {
    setPending(true);
    formData.set("taskId", task!.id);
    formData.set("slug", slug);
    const result = await deleteTaskAction(formData);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Tarea eliminada");
    onDone?.();
  }

  return (
    <form action={onSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="title">Título</Label>
        <Input
          id="title"
          name="title"
          required
          defaultValue={task?.title}
          placeholder="Qué hay que hacer"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="description">Descripción</Label>
        <Textarea
          id="description"
          name="description"
          defaultValue={task?.description ?? ""}
          placeholder="Contexto, enlaces, criterios…"
          rows={4}
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
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
              {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
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
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {task ? (
          <Button formAction={onDelete} type="submit" variant="destructive" disabled={pending}>
            Eliminar
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" disabled={pending}>
          {task ? "Guardar" : "Crear tarea"}
        </Button>
      </div>
    </form>
  );
}
