import assert from "node:assert/strict";
import {
  buildDoingPayload,
  shouldDispatchDoingWebhook,
} from "../lib/webhooks.ts";

const cases = [
  [
    { nextStatus: "doing", assigneeType: "bot", previousStatus: "inbox" },
    true,
  ],
  [
    { nextStatus: "doing", assigneeType: "human", previousStatus: "inbox" },
    false,
  ],
  [
    { nextStatus: "review", assigneeType: "bot", previousStatus: "doing" },
    false,
  ],
  [
    {
      nextStatus: "doing",
      assigneeType: "bot",
      previousStatus: "doing",
      previousAssigneeType: "human",
    },
    true,
  ],
  [
    {
      nextStatus: "doing",
      assigneeType: "bot",
      previousStatus: "doing",
      previousAssigneeType: "bot",
    },
    false,
  ],
  [{ nextStatus: "doing", assigneeType: "bot", previousStatus: null }, true],
];

for (const [input, expected] of cases) {
  assert.equal(
    shouldDispatchDoingWebhook(input),
    expected,
    JSON.stringify(input)
  );
}

const payload = buildDoingPayload(
  {
    id: "task-1",
    project_id: "proj-1",
    title: "Demo",
    description: null,
    status: "doing",
    assignee_type: "bot",
    bot_id: "bot-1",
    priority: "high",
    due_at: null,
    archived_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    started_at: "2026-01-01T00:00:00.000Z",
    webhook_error: null,
    webhook_fired_at: null,
  },
  { id: "proj-1", slug: "leadflow", name: "Leadflow", created_at: "2026-01-01T00:00:00.000Z" },
  {
    id: "bot-1",
    name: "Flow",
    project_id: "proj-1",
    webhook_url: "https://example.test/hook",
    created_at: "2026-01-01T00:00:00.000Z",
  }
);

assert.equal(payload.event, "task.doing");
assert.equal(payload.task.id, "task-1");
assert.equal(payload.project.slug, "leadflow");
assert.equal(payload.bot.name, "Flow");
assert.equal(payload.task.due_at, null);
assert.ok(!("webhook_url" in payload.bot));

console.log("webhook contract ok");
