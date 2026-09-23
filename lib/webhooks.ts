import type { AssigneeType, Bot, Project, Task, TaskStatus } from "@/lib/types";

export type DoingWebhookPayload = {
  event: "task.doing";
  task: {
    id: string;
    project_id: string;
    title: string;
    description: string | null;
    status: TaskStatus;
    assignee_type: AssigneeType;
    bot_id: string | null;
    priority: Task["priority"];
    due_at: string | null;
    created_at: string;
    updated_at: string;
    started_at: string | null;
  };
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
};

export function shouldDispatchDoingWebhook(input: {
  nextStatus: TaskStatus;
  assigneeType: AssigneeType;
  previousStatus?: TaskStatus | null;
  previousAssigneeType?: AssigneeType | null;
}): boolean {
  if (input.nextStatus !== "doing" || input.assigneeType !== "bot") {
    return false;
  }
  const enteredDoing = input.previousStatus !== "doing";
  const becameBot = input.previousAssigneeType !== "bot";
  return enteredDoing || becameBot;
}

export function buildDoingPayload(
  task: Task,
  project: Project,
  bot: Bot
): DoingWebhookPayload {
  return {
    event: "task.doing",
    task: {
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
    },
    project: {
      id: project.id,
      slug: project.slug,
      name: project.name,
    },
    bot: {
      id: bot.id,
      name: bot.name,
      project_id: bot.project_id,
    },
  };
}

export async function dispatchDoingWebhook(input: {
  task: Task;
  project: Project;
  bot: Bot;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const url = input.bot.webhook_url?.trim();
  if (!url) {
    return {
      ok: false,
      error: "El bot no tiene URL de webhook configurada.",
    };
  }

  const payload = buildDoingPayload(input.task, input.project, input.bot);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "user-agent": "do.it-hub/1.0",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const excerpt = body.replace(/\s+/g, " ").trim().slice(0, 180);
      return {
        ok: false,
        error: excerpt
          ? `Webhook respondió ${response.status}: ${excerpt}`
          : `Webhook respondió ${response.status}`,
      };
    }

    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error de red";
    return { ok: false, error: `Webhook no alcanzado: ${message}` };
  }
}
