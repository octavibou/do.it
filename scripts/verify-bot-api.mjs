import assert from "node:assert/strict";

import {
  authorizeBotApi,
  botActor,
  handleGetBotCurrent,
  handleGetBotTask,
  handleGetBotTasks,
  handlePatchBotTask,
  parseBotTaskPatch,
  parseJsonBody,
  parseTaskListQuery,
  taskBelongsToBotProject,
} from "../lib/bot-api.ts";
import { isBotApiPath, verifyBotApiToken, verifyBotBearer } from "../lib/auth-token.ts";

const TOKEN = "bot-secret-token";
const OTHER = "wrong-token";

async function withToken(value, fn) {
  const prev = process.env.BOT_API_TOKEN;
  if (value === undefined) {
    delete process.env.BOT_API_TOKEN;
  } else {
    process.env.BOT_API_TOKEN = value;
  }
  try {
    return await fn();
  } finally {
    if (prev === undefined) {
      delete process.env.BOT_API_TOKEN;
    } else {
      process.env.BOT_API_TOKEN = prev;
    }
  }
}

const flow = {
  id: "7d765d6a-63aa-4d4d-9914-0b3d26dee739",
  name: "Flow",
  project_id: "proj-leadflow",
  webhook_url: null,
  created_at: "2026-01-01T00:00:00.000Z",
  project: {
    id: "proj-leadflow",
    slug: "leadflow",
    name: "Leadflow",
    created_at: "2026-01-01T00:00:00.000Z",
  },
};

const ownTask = {
  id: "task-1",
  project_id: "proj-leadflow",
  title: "Revisar leads",
  description: "viejo",
  status: "inbox",
  assignee_type: "human",
  bot_id: null,
  priority: "high",
  due_at: null,
  archived_at: null,
};

const foreignTask = {
  ...ownTask,
  id: "task-other",
  project_id: "proj-personal",
};

function baseDeps(overrides = {}) {
  return {
    isSupabaseConfigured: () => true,
    getBot: async (id) => (id === flow.id ? flow : null),
    listProjectTasks: async () => [ownTask],
    listDoingTasksForBot: async () => [],
    getTask: async (taskId) => {
      if (taskId === ownTask.id) {
        return ownTask;
      }
      if (taskId === foreignTask.id) {
        return foreignTask;
      }
      return null;
    },
    updateBotProjectTask: async (taskId, patch) => ({
      ...ownTask,
      ...patch,
      description: patch.description ?? ownTask.description,
    }),
    ...overrides,
  };
}

assert.equal(isBotApiPath("/api/bots/abc/tasks"), true);
assert.equal(isBotApiPath("/api/projects"), false);
assert.equal(botActor("Flow"), "bot:Flow");

await withToken(undefined, () => {
  assert.equal(verifyBotApiToken(TOKEN), false);
  assert.equal(verifyBotBearer(`Bearer ${TOKEN}`), false);
});

await withToken(TOKEN, () => {
  assert.equal(verifyBotApiToken(TOKEN), true);
  assert.equal(verifyBotApiToken(OTHER), false);
  assert.equal(verifyBotBearer(`Bearer ${TOKEN}`), true);
  assert.equal(verifyBotBearer(`bearer ${TOKEN}`), true);
  assert.equal(verifyBotBearer(`Bearer ${OTHER}`), false);
  assert.equal(verifyBotBearer(TOKEN), false);
  assert.equal(verifyBotBearer(null), false);

  const authFail = authorizeBotApi({
    bearerOk: verifyBotBearer(`Bearer ${OTHER}`),
  });
  assert.equal(authFail.status, 401);
  assert.equal(authFail.body.error, "Unauthorized");

  const authOk = authorizeBotApi({
    bearerOk: verifyBotBearer(`Bearer ${TOKEN}`),
  });
  assert.equal(authOk.ok, true);
  assert.equal(authOk.via, "bearer");

  const sessionOk = authorizeBotApi({ sessionOk: true });
  assert.equal(sessionOk.ok, true);
  assert.equal(sessionOk.via, "session");

  assert.equal(taskBelongsToBotProject(ownTask, flow), true);
  assert.equal(taskBelongsToBotProject(foreignTask, flow), false);
  assert.equal(taskBelongsToBotProject(null, flow), false);

  const listQuery = parseTaskListQuery(new URLSearchParams("status=inbox,doing"));
  assert.equal(listQuery.ok, true);
  assert.deepEqual(listQuery.filters.statuses, ["inbox", "doing"]);
  assert.equal(listQuery.filters.includeArchived, false);

  const badStatus = parseTaskListQuery(new URLSearchParams("status=inbox,nope"));
  assert.equal(badStatus.status, 400);

  const rejected = parseBotTaskPatch({ status: "done", description: "no" });
  assert.equal(rejected.status, 403);

  const assigneeRejected = parseBotTaskPatch({ assignee_type: "human" });
  assert.equal(assigneeRejected.status, 403);

  const archivedRejected = parseBotTaskPatch({ archived_at: "2026-01-01T00:00:00.000Z" });
  assert.equal(archivedRejected.status, 403);

  const botIdRejected = parseBotTaskPatch({ bot_id: flow.id });
  assert.equal(botIdRejected.status, 403);

  const okPatch = parseBotTaskPatch({ description: "nuevo cuerpo" });
  assert.equal(okPatch.ok, true);
  assert.equal(okPatch.patch.description, "nuevo cuerpo");

  const invalidJson = parseJsonBody("{");
  assert.equal(invalidJson.status, 400);
});

await withToken(TOKEN, async () => {
  const unauthorized = await handleGetBotTasks({
    botId: flow.id,
    searchParams: new URLSearchParams(),
    bearerOk: false,
    deps: baseDeps(),
  });
  assert.equal(unauthorized.status, 401, "auth failure");
  assert.equal(unauthorized.body.error, "Unauthorized");

  const patchUnauthorized = await handlePatchBotTask({
    botId: flow.id,
    taskId: ownTask.id,
    body: { description: "x" },
    bearerOk: false,
    deps: baseDeps(),
  });
  assert.equal(patchUnauthorized.status, 401, "auth failure");

  const currentUnauthorized = await handleGetBotCurrent({
    botId: flow.id,
    bearerOk: false,
    sessionOk: false,
    deps: baseDeps(),
  });
  assert.equal(currentUnauthorized.status, 401);

  const currentWithSession = await handleGetBotCurrent({
    botId: flow.id,
    bearerOk: false,
    sessionOk: true,
    deps: baseDeps(),
  });
  assert.equal(currentWithSession.status, 200);

  const crossProject = await handleGetBotTask({
    botId: flow.id,
    taskId: foreignTask.id,
    bearerOk: true,
    deps: baseDeps(),
  });
  assert.equal(crossProject.status, 404, "cross-project 404");
  assert.equal(crossProject.body.error, "Task not found");

  const missingTask = await handleGetBotTask({
    botId: flow.id,
    taskId: "missing",
    bearerOk: true,
    deps: baseDeps(),
  });
  assert.equal(missingTask.status, 404);

  const statusRejected = await handlePatchBotTask({
    botId: flow.id,
    taskId: ownTask.id,
    body: { status: "done" },
    bearerOk: true,
    deps: baseDeps(),
  });
  assert.equal(statusRejected.status, 403, "status patch rejected");

  let updated = null;
  const descriptionOk = await handlePatchBotTask({
    botId: flow.id,
    taskId: ownTask.id,
    body: { description: "Cuerpo desde Flow" },
    bearerOk: true,
    deps: baseDeps({
      updateBotProjectTask: async (taskId, patch, actor) => {
        updated = { taskId, patch, actor };
        return { ...ownTask, description: patch.description };
      },
    }),
  });
  assert.equal(descriptionOk.status, 200, "description update ok");
  assert.equal(descriptionOk.body.task.description, "Cuerpo desde Flow");
  assert.equal(updated.taskId, ownTask.id);
  assert.equal(updated.patch.description, "Cuerpo desde Flow");
  assert.equal(updated.actor, "bot:Flow");

  const listed = await handleGetBotTasks({
    botId: flow.id,
    searchParams: new URLSearchParams("status=inbox,doing"),
    bearerOk: true,
    deps: baseDeps({
      listProjectTasks: async (projectId, filters) => {
        assert.equal(projectId, flow.project_id);
        assert.deepEqual(filters.statuses, ["inbox", "doing"]);
        assert.equal(filters.includeArchived, false);
        return [ownTask];
      },
    }),
  });
  assert.equal(listed.status, 200);
  assert.equal(listed.body.bot.name, "Flow");
  assert.equal(listed.body.tasks.length, 1);
});

console.log("bot api ok");
