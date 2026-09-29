import type { AssigneeType, Bot, Project, Task } from "@/lib/types";

export const DEFAULT_WEBHOOK_HEADER = "Authorization";
export const WEBHOOK_TIMEOUT_MS = 10_000;
export const WEBHOOK_USER_AGENT = "do.it-hub/1.0";
export const WEBHOOK_DELIVERY_KEEP = 10;

export type WebhookEventName = "task.assigned" | "webhook.test";

export type PreviousAssignee = {
  assignee_type: AssigneeType | null;
  bot_id: string | null;
};

export type TaskWebhookSlice = {
  id: string;
  project_id: string;
  title: string;
  description: string | null;
  status: Task["status"];
  assignee_type: AssigneeType;
  bot_id: string | null;
  priority: Task["priority"];
  due_at: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
};

export type AssignedWebhookPayload = {
  event: WebhookEventName;
  event_id: string;
  sent_at: string;
  task: TaskWebhookSlice | null;
  project: {
    id: string;
    slug: string;
    name: string;
  };
  bot: {
    id: string;
    name: string;
    project_id: string;
  };
  previous_assignee: PreviousAssignee | null;
};

export type WebhookDispatchResult =
  | {
      ok: true;
      event: WebhookEventName;
      eventId: string;
      sentAt: string;
      httpStatus: number;
    }
  | {
      ok: false;
      event: WebhookEventName;
      eventId: string;
      sentAt: string;
      httpStatus: number | null;
      error: string;
    };

export function shouldDispatchAssignedWebhook(input: {
  assigneeType: AssigneeType;
  botId?: string | null;
  previousAssigneeType?: AssigneeType | null;
  previousBotId?: string | null;
}): boolean {
  if (input.assigneeType !== "bot") {
    return false;
  }

  const nextBotId = input.botId ?? null;
  if (!nextBotId) {
    return false;
  }

  const sameBot =
    input.previousAssigneeType === "bot" && (input.previousBotId ?? null) === nextBotId;
  return !sameBot;
}

export function last4OfSecret(secret: string): string {
  return secret.trim().slice(-4);
}

export function normalizeWebhookHeaderName(name: string | null | undefined): string {
  const trimmed = name?.trim() || DEFAULT_WEBHOOK_HEADER;
  if (!/^[A-Za-z0-9-]+$/.test(trimmed)) {
    throw new Error("El nombre del header de webhook no es válido.");
  }
  return trimmed;
}

export function buildWebhookAuthHeaders(input: {
  secret?: string | null;
  headerName?: string | null;
}): Record<string, string> {
  const secret = input.secret?.trim();
  if (!secret) {
    return {};
  }

  const headerName = input.headerName?.trim() || DEFAULT_WEBHOOK_HEADER;
  if (headerName.toLowerCase() === "authorization") {
    const value = /^bearer\s+/i.test(secret) ? secret : `Bearer ${secret}`;
    return { Authorization: value };
  }

  return { [headerName]: secret };
}

export function buildTaskWebhookSlice(task: Task): TaskWebhookSlice {
  return {
    id: task.id,
    project_id: task.project_id,
    title: task.title,
    description: task.description,
    status: task.status,
    assignee_type: task.assignee_type,
    bot_id: task.bot_id,
    priority: task.priority,
    due_at: task.due_at,
    created_at: task.created_at,
    updated_at: task.updated_at,
    started_at: task.started_at,
  };
}

export function buildWebhookPayload(input: {
  event: WebhookEventName;
  task: Task | null;
  project: Project;
  bot: Bot;
  previousAssignee?: PreviousAssignee | null;
  eventId?: string;
  sentAt?: string;
}): AssignedWebhookPayload {
  return {
    event: input.event,
    event_id: input.eventId ?? crypto.randomUUID(),
    sent_at: input.sentAt ?? new Date().toISOString(),
    task: input.task ? buildTaskWebhookSlice(input.task) : null,
    project: {
      id: input.project.id,
      slug: input.project.slug,
      name: input.project.name,
    },
    bot: {
      id: input.bot.id,
      name: input.bot.name,
      project_id: input.bot.project_id,
    },
    previous_assignee: input.previousAssignee ?? null,
  };
}

export async function dispatchBotWebhook(input: {
  event: WebhookEventName;
  task: Task | null;
  project: Project;
  bot: Bot;
  previousAssignee?: PreviousAssignee | null;
  secret?: string | null;
  headerName?: string | null;
}): Promise<WebhookDispatchResult> {
  const eventId = crypto.randomUUID();
  const sentAt = new Date().toISOString();
  const url = input.bot.webhook_url?.trim();

  if (!url) {
    return {
      ok: false,
      event: input.event,
      eventId,
      sentAt,
      httpStatus: null,
      error: "El bot no tiene URL de webhook configurada.",
    };
  }

  const payload = buildWebhookPayload({
    event: input.event,
    task: input.task,
    project: input.project,
    bot: input.bot,
    previousAssignee: input.previousAssignee,
    eventId,
    sentAt,
  });

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": WEBHOOK_USER_AGENT,
        ...buildWebhookAuthHeaders({
          secret: input.secret,
          headerName: input.headerName,
        }),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(WEBHOOK_TIMEOUT_MS),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const excerpt = body.replace(/\s+/g, " ").trim().slice(0, 180);
      return {
        ok: false,
        event: input.event,
        eventId,
        sentAt,
        httpStatus: response.status,
        error: excerpt
          ? `Webhook respondió ${response.status}: ${excerpt}`
          : `Webhook respondió ${response.status}`,
      };
    }

    return {
      ok: true,
      event: input.event,
      eventId,
      sentAt,
      httpStatus: response.status,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error de red";
    return {
      ok: false,
      event: input.event,
      eventId,
      sentAt,
      httpStatus: null,
      error: `Webhook no alcanzado: ${message}`,
    };
  }
}
