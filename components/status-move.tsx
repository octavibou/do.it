"use client";

import { useState } from "react";
import { toast } from "sonner";

import { moveTaskAction } from "@/app/actions/tasks";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { INBOX_GATE_COPY, STATUS_LABELS } from "@/lib/labels";
import type { TaskStatus, TaskSummary, TaskWithRelations } from "@/lib/types";

type PendingMove = {
  task: TaskWithRelations;
  nextStatus: TaskStatus;
};

export function useStatusMove(slug: string) {
  const [inboxMove, setInboxMove] = useState<PendingMove | null>(null);
  const [overrideMove, setOverrideMove] = useState<(PendingMove & { blockers: TaskSummary[] }) | null>(
    null
  );
  const [pending, setPending] = useState(false);

  async function execute(task: TaskWithRelations, nextStatus: TaskStatus, overrideStart = false) {
    setPending(true);
    const result = await moveTaskAction(task.id, nextStatus, slug, { overrideStart });
    setPending(false);

    if (!result.ok) {
      if (result.code === "blocked") {
        setOverrideMove({ task, nextStatus, blockers: result.blockers ?? [] });
        return result;
      }
      toast.error(result.error);
      return result;
    }

    if (result.webhookError) {
      toast.error(result.webhookError);
    }
    return result;
  }

  async function requestMove(task: TaskWithRelations, nextStatus: TaskStatus) {
    if (task.status === nextStatus) {
      return;
    }
    if (task.status === "inbox" && nextStatus !== "inbox") {
      setInboxMove({ task, nextStatus });
      return;
    }
    return execute(task, nextStatus);
  }

  const dialogs = (
    <>
      <ConfirmDialog
        open={Boolean(inboxMove)}
        title="Empezar / Mover"
        description={`${INBOX_GATE_COPY} Vas a sacar «${inboxMove?.task.title ?? ""}» de Bandeja hacia ${inboxMove ? STATUS_LABELS[inboxMove.nextStatus] : ""}.`}
        confirmLabel="Empezar / Mover"
        pending={pending}
        onOpenChange={(open) => {
          if (!open) {
            setInboxMove(null);
          }
        }}
        onConfirm={async () => {
          if (!inboxMove) {
            return;
          }
          const current = inboxMove;
          setInboxMove(null);
          await execute(current.task, current.nextStatus);
        }}
      />
      <ConfirmDialog
        open={Boolean(overrideMove)}
        title="Forzar inicio (override)"
        description={
          overrideMove
            ? `Hay bloqueadores sin terminar: ${overrideMove.blockers.map((item) => item.title).join(", ") || "—"}. Solo Octavi puede forzar el paso a En curso.`
            : ""
        }
        confirmLabel="Forzar inicio (override)"
        pending={pending}
        onOpenChange={(open) => {
          if (!open) {
            setOverrideMove(null);
          }
        }}
        onConfirm={async () => {
          if (!overrideMove) {
            return;
          }
          const current = overrideMove;
          setOverrideMove(null);
          await execute(current.task, current.nextStatus, true);
        }}
      />
    </>
  );

  return { requestMove, dialogs, pending };
}
