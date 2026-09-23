"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { addDependencyAction, removeDependencyAction } from "@/app/actions/tasks";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { STATUS_LABELS } from "@/lib/labels";
import type { TaskWithRelations } from "@/lib/types";

export function TaskDependencies({
  task,
  tasks,
  slug,
}: {
  task: TaskWithRelations;
  tasks: TaskWithRelations[];
  slug: string;
}) {
  const [blockerId, setBlockerId] = useState("");
  const [blockedId, setBlockedId] = useState("");
  const [pending, setPending] = useState(false);

  const options = useMemo(
    () =>
      tasks.filter(
        (item) => item.id !== task.id && !item.archived_at && item.project_id === task.project_id
      ),
    [task.id, task.project_id, tasks]
  );

  async function add(blockerTaskId: string, blockedTaskId: string) {
    if (!blockerTaskId || !blockedTaskId) {
      return;
    }
    setPending(true);
    const formData = new FormData();
    formData.set("blockerTaskId", blockerTaskId);
    formData.set("blockedTaskId", blockedTaskId);
    formData.set("slug", slug);
    const result = await addDependencyAction(formData);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Dependencia guardada");
    setBlockerId("");
    setBlockedId("");
  }

  async function remove(blockerTaskId: string, blockedTaskId: string) {
    setPending(true);
    const formData = new FormData();
    formData.set("blockerTaskId", blockerTaskId);
    formData.set("blockedTaskId", blockedTaskId);
    formData.set("slug", slug);
    const result = await removeDependencyAction(formData);
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Dependencia quitada");
  }

  return (
    <section className="grid gap-3">
      <h3 className="text-sm font-medium">Dependencias</h3>
      <p className="text-xs text-muted-foreground">
        Un bloqueador tiene que estar en Hecho para pasar esta tarea a En curso, salvo override de
        Octavi.
      </p>
      <div className="grid gap-2">
        <p className="text-xs font-medium">La bloquean</p>
        {task.blocked_by.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nadie la bloquea.</p>
        ) : (
          <ul className="grid gap-1.5">
            {task.blocked_by.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 text-xs">
                <span>
                  {item.title}{" "}
                  <span className="text-muted-foreground">({STATUS_LABELS[item.status]})</span>
                </span>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => remove(item.id, task.id)}
                >
                  Quitar
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-end gap-2">
          <div className="grid min-w-0 flex-1 gap-1.5">
            <Label className="text-xs">Añadir bloqueador</Label>
            <Select value={blockerId} onValueChange={setBlockerId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Tarea que debe terminar antes" />
              </SelectTrigger>
              <SelectContent>
                {options.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" size="sm" disabled={!blockerId || pending} onClick={() => add(blockerId, task.id)}>
            Añadir
          </Button>
        </div>
      </div>
      <div className="grid gap-2">
        <p className="text-xs font-medium">Ella bloquea</p>
        {task.blocks.length === 0 ? (
          <p className="text-xs text-muted-foreground">No bloquea a nadie.</p>
        ) : (
          <ul className="grid gap-1.5">
            {task.blocks.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-2 text-xs">
                <span>
                  {item.title}{" "}
                  <span className="text-muted-foreground">({STATUS_LABELS[item.status]})</span>
                </span>
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => remove(task.id, item.id)}
                >
                  Quitar
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-end gap-2">
          <div className="grid min-w-0 flex-1 gap-1.5">
            <Label className="text-xs">Añadir tarea bloqueada</Label>
            <Select value={blockedId} onValueChange={setBlockedId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Tarea que espera a esta" />
              </SelectTrigger>
              <SelectContent>
                {options.map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button type="button" size="sm" disabled={!blockedId || pending} onClick={() => add(task.id, blockedId)}>
            Añadir
          </Button>
        </div>
      </div>
    </section>
  );
}
