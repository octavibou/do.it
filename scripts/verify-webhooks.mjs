import assert from "node:assert/strict";
import {
  buildWebhookAuthHeaders,
  buildWebhookPayload,
  last4OfSecret,
  normalizeWebhookHeaderName,
  shouldDispatchAssignedWebhook,
} from "../lib/webhooks.ts";

const cases = [
  [
    {
      assigneeType: "bot",
      botId: "bot-1",
      previousAssigneeType: "human",
      previousBotId: null,
    },
    true,
    "human -> bot",
  ],
  [
    {
      assigneeType: "bot",
      botId: "bot-1",
      previousAssigneeType: null,
      previousBotId: null,
    },
    true,
    "create with bot",
  ],
  [
    {
      assigneeType: "bot",
      botId: "bot-b",
      previousAssigneeType: "bot",
      previousBotId: "bot-a",
    },
    true,
    "botA -> botB",
  ],
  [
    {
      assigneeType: "bot",
      botId: "bot-1",
      previousAssigneeType: "bot",
      previousBotId: "bot-1",
    },
    false,
    "same bot stays assigned",
  ],
  [
    {
      assigneeType: "human",
      botId: null,
      previousAssigneeType: "bot",
      previousBotId: "bot-1",
    },
    false,
    "assigned to human",
  ],
  [
    {
      assigneeType: "human",
      botId: null,
      previousAssigneeType: "human",
      previousBotId: null,
    },
    false,
    "human stays human",
  ],
  [
    { assigneeType: "bot", botId: null, previousAssigneeType: "human" },
    false,
    "bot type without bot id",
  ],
];

for (const [input, expected, label] of cases) {
  assert.equal(shouldDispatchAssignedWebhook(input), expected, label);
}

const task = {
  id: "task-1",
  project_id: "proj-1",
  title: "Demo",
  description: null,
  status: "inbox",
  assignee_type: "bot",
  bot_id: "bot-1",
  priority: "high",
  due_at: null,
  archived_at: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  started_at: null,
  webhook_error: null,
  webhook_fired_at: null,
};

const project = {
  id: "proj-1",
  slug: "leadflow",
  name: "Leadflow",
  created_at: "2026-01-01T00:00:00.000Z",
};

const bot = {
  id: "bot-1",
  name: "Flow",
  project_id: "proj-1",
  webhook_url: "https://example.test/hook",
  webhook_secret: "should-never-leak",
  created_at: "2026-01-01T00:00:00.000Z",
};

const payload = buildWebhookPayload({
  event: "task.assigned",
  task,
  project,
  bot,
  previousAssignee: { assignee_type: "human", bot_id: null },
  eventId: "evt-1",
  sentAt: "2026-09-29T08:00:00.000Z",
});

assert.equal(payload.event, "task.assigned");
assert.equal(payload.event_id, "evt-1");
assert.equal(payload.sent_at, "2026-09-29T08:00:00.000Z");
assert.equal(payload.task.id, "task-1");
assert.equal(payload.task.status, "inbox");
assert.equal(payload.project.slug, "leadflow");
assert.equal(payload.bot.name, "Flow");
assert.deepEqual(payload.previous_assignee, { assignee_type: "human", bot_id: null });
assert.ok(!("webhook_url" in payload.bot));
assert.ok(!("webhook_secret" in payload.bot));
assert.ok(!JSON.stringify(payload).includes("should-never-leak"));

const testPayload = buildWebhookPayload({
  event: "webhook.test",
  task: null,
  project,
  bot,
  eventId: "evt-test",
  sentAt: "2026-09-29T08:00:01.000Z",
});
assert.equal(testPayload.event, "webhook.test");
assert.equal(testPayload.task, null);
assert.equal(testPayload.previous_assignee, null);

assert.deepEqual(buildWebhookAuthHeaders({ secret: "abc" }), {
  Authorization: "Bearer abc",
});
assert.deepEqual(buildWebhookAuthHeaders({ secret: "Bearer xyz" }), {
  Authorization: "Bearer xyz",
});
assert.deepEqual(buildWebhookAuthHeaders({ secret: "abc", headerName: "X-Grok-Key" }), {
  "X-Grok-Key": "abc",
});
assert.deepEqual(buildWebhookAuthHeaders({ secret: null }), {});
assert.deepEqual(buildWebhookAuthHeaders({ secret: "  " }), {});
assert.equal(last4OfSecret("super-secret"), "cret");
assert.equal(normalizeWebhookHeaderName(""), "Authorization");
assert.equal(normalizeWebhookHeaderName("X-Grok-Key"), "X-Grok-Key");
assert.throws(() => normalizeWebhookHeaderName("Bad Header"), /header/);

console.log("webhook contract ok");
