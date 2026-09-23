"use client";

import { useEffect, useState } from "react";

import { loadTaskEventsAction } from "@/app/actions/tasks";
import { EVENT_ACTION_LABELS, STATUS_LABELS } from "@/lib/labels";
import { formatDueAt } from "@/lib/task-rules";
import type { TaskEvent, TaskStatus } from "@/lib/types";

function formatValue(value: string | null, action: TaskEvent["action"]): string {
  if (value == null || value === "") {
    return "—";
  }
  if (action === "status_change" && value in STATUS_LABELS) {
    return STATUS_LABELS[value as TaskStatus];
  }
  return value;
}

export function TaskActivity({ taskId }: { taskId: string }) {
  const [events, setEvents] = useState<TaskEvent[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadTaskEventsAction(taskId)
      .then((rows) => {
        if (!cancelled) {
          setEvents(rows);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEvents([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  return (
    <section className="grid gap-2">
      <h3 className="text-sm font-medium">Actividad reciente</h3>
      {events == null ? (
        <p className="text-xs text-muted-foreground">Cargando…</p>
      ) : events.length === 0 ? (
        <p className="text-xs text-muted-foreground">Todavía no hay eventos.</p>
      ) : (
        <ol className="grid max-h-48 gap-2 overflow-y-auto pr-1">
          {events.map((event) => (
            <li key={event.id} className="rounded-lg bg-muted/60 px-3 py-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{EVENT_ACTION_LABELS[event.action]}</span>
                <time className="text-muted-foreground">{formatDueAt(event.at)}</time>
              </div>
              <p className="mt-1 text-muted-foreground">
                {event.actor}
                {event.from_value || event.to_value
                  ? `: ${formatValue(event.from_value, event.action)} → ${formatValue(event.to_value, event.action)}`
                  : null}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
