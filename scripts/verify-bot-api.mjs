import assert from "node:assert/strict";

import {
  authorizeBotApi,
  botActor,
  handleGetBotCurrent,
  handleGetBotTask,
  handleGetBotTasks,
  handlePatchBotTask,
  handlePostBotTask,
  assertPatchAssigneeInProject,
  parseBotTaskCreate,
  parseBotTaskPatch,
  parseJsonBody,
  parseTaskListQuery,
  taskBelongsToBotProject,
} from "../lib/bot-api.ts";
import { isBotApiPath, verifyBotApiToken, verifyBotBearer } from "../lib/auth-token.ts";
import { DependencyBlockError, DuplicateTaskError } from "../lib/errors.ts";

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

const flowHelper = {
  id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  name: "FlowHelper",
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

const home = {
  id: "728f5795-a9b8-4253-8ffd-4dbd25f57a0c",
  name: "Home",
  project_id: "proj-personal",
  webhook_url: null,
  created_at: "2026-01-01T00:00:00.000Z",
  project: {
    id: "proj-personal",
    slug: "personal",
    name: "Personal",
    created_at: "2026-01-01T00:00:00.000Z",
  },
};

function botsById(...bots) {
  const map = new Map(bots.map((bot) => [bot.id, bot]));
  return async (id) => map.get(id) ?? null;
}

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
    getBot: botsById(flow, flowHelper, home),
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
    createBotProjectTask: async (projectId, input) => ({
      ...ownTask,
      id: "task-created",
      project_id: projectId,
      title: input.title,
      description: input.description ?? null,
      status: "inbox",
      assignee_type: input.assigneeType,
      bot_id: input.botId,
      priority: input.priority ?? null,
      due_at: input.dueAt ?? null,
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

  const statusPatch = parseBotTaskPatch({ status: "done", description: "no" }, flow.id);
  assert.equal(statusPatch.ok, true);
  assert.equal(statusPatch.patch.status, "done");
  assert.equal(statusPatch.patch.description, "no");

  const assigneeHuman = parseBotTaskPatch({ assignee_type: "human" }, flow.id);
  assert.equal(assigneeHuman.ok, true);
  assert.equal(assigneeHuman.patch.assigneeType, "human");
  assert.equal(assigneeHuman.patch.botId, null);

  const archivedPatch = parseBotTaskPatch({ archived_at: "2026-01-01T00:00:00.000Z" }, flow.id);
  assert.equal(archivedPatch.ok, true);
  assert.equal(archivedPatch.patch.archivedAt, "2026-01-01T00:00:00.000Z");

  const unarchivePatch = parseBotTaskPatch({ archived_at: null }, flow.id);
  assert.equal(unarchivePatch.ok, true);
  assert.equal(unarchivePatch.patch.archivedAt, null);

  const botIdPatch = parseBotTaskPatch({ bot_id: flow.id }, flow.id);
  assert.equal(botIdPatch.ok, true);
  assert.equal(botIdPatch.patch.assigneeType, "bot");
  assert.equal(botIdPatch.patch.botId, flow.id);

  const botTypeDefaultsSelf = parseBotTaskPatch({ assignee_type: "bot" }, flow.id);
  assert.equal(botTypeDefaultsSelf.ok, true);
  assert.equal(botTypeDefaultsSelf.patch.assigneeType, "bot");
  assert.equal(botTypeDefaultsSelf.patch.botId, flow.id);

  const invalidStatus = parseBotTaskPatch({ status: "nope" }, flow.id);
  assert.equal(invalidStatus.status, 400);
  assert.equal(invalidStatus.body.error, "Invalid status");

  const invalidAssignee = parseBotTaskPatch({ assignee_type: "alien" }, flow.id);
  assert.equal(invalidAssignee.status, 400);

  const humanWithBotId = parseBotTaskPatch(
    { assignee_type: "human", bot_id: flow.id },
    flow.id
  );
  assert.equal(humanWithBotId.status, 400);

  const invalidArchived = parseBotTaskPatch({ archived_at: "not-a-date" }, flow.id);
  assert.equal(invalidArchived.status, 400);

  const botWithoutId = parseBotTaskPatch({ assignee_type: "bot" });
  assert.equal(botWithoutId.status, 400);

  const okPatch = parseBotTaskPatch({ description: "nuevo cuerpo" });
  assert.equal(okPatch.ok, true);
  assert.equal(okPatch.patch.description, "nuevo cuerpo");

  const scopedOk = await assertPatchAssigneeInProject({
    patch: { assigneeType: "bot", botId: flow.id },
    projectId: flow.project_id,
    getBot: botsById(flow, home),
  });
  assert.equal(scopedOk.ok, true);

  const scopedForeign = await assertPatchAssigneeInProject({
    patch: { assigneeType: "bot", botId: home.id },
    projectId: flow.project_id,
    getBot: botsById(flow, home),
  });
  assert.equal(scopedForeign.status, 403);
  assert.equal(scopedForeign.body.error, "Bot does not belong to this project");

  const scopedMissing = await assertPatchAssigneeInProject({
    patch: { assigneeType: "bot", botId: "missing-bot" },
    projectId: flow.project_id,
    getBot: botsById(flow),
  });
  assert.equal(scopedMissing.status, 400);

  const createOk = parseBotTaskCreate({ title: "Nueva inbox" }, flow.id);
  assert.equal(createOk.ok, true);
  assert.equal(createOk.input.title, "Nueva inbox");
  assert.equal(createOk.input.assigneeType, "human");
  assert.equal(createOk.input.botId, null);

  const createBotAssignee = parseBotTaskCreate(
    { title: "Para Flow", assignee_type: "bot" },
    flow.id
  );
  assert.equal(createBotAssignee.ok, true);
  assert.equal(createBotAssignee.input.assigneeType, "bot");
  assert.equal(createBotAssignee.input.botId, flow.id);

  const createBotIdOnly = parseBotTaskCreate({ title: "Para Flow", bot_id: flow.id }, flow.id);
  assert.equal(createBotIdOnly.ok, true);
  assert.equal(createBotIdOnly.input.assigneeType, "bot");
  assert.equal(createBotIdOnly.input.botId, flow.id);

  const createOtherBot = parseBotTaskCreate(
    { title: "Otro", assignee_type: "bot", bot_id: "728f5795-a9b8-4253-8ffd-4dbd25f57a0c" },
    flow.id
  );
  assert.equal(createOtherBot.status, 403);

  const createInboxStatus = parseBotTaskCreate({ title: "Ok", status: "inbox" }, flow.id);
  assert.equal(createInboxStatus.ok, true);

  const createDoing = parseBotTaskCreate({ title: "No", status: "doing" }, flow.id);
  assert.equal(createDoing.status, 403);

  const createArchived = parseBotTaskCreate(
    { title: "No", archived_at: "2026-01-01T00:00:00.000Z" },
    flow.id
  );
  assert.equal(createArchived.status, 403);

  const createMissingTitle = parseBotTaskCreate({ description: "sin título" }, flow.id);
  assert.equal(createMissingTitle.status, 400);

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

  const crossProjectPatch = await handlePatchBotTask({
    botId: flow.id,
    taskId: foreignTask.id,
    body: { status: "done" },
    bearerOk: true,
    deps: baseDeps(),
  });
  assert.equal(crossProjectPatch.status, 404, "cross-project patch 404");
  assert.equal(crossProjectPatch.body.error, "Task not found");

  let moved = null;
  const statusOk = await handlePatchBotTask({
    botId: flow.id,
    taskId: ownTask.id,
    body: { status: "done" },
    bearerOk: true,
    deps: baseDeps({
      updateBotProjectTask: async (taskId, patch, actor) => {
        moved = { taskId, patch, actor };
        return { ...ownTask, status: patch.status };
      },
    }),
  });
  assert.equal(statusOk.status, 200, "status patch allowed");
  assert.equal(statusOk.body.task.status, "done");
  assert.equal(moved.patch.status, "done");
  assert.equal(moved.actor, "bot:Flow");

  for (const status of ["inbox", "doing", "review", "done"]) {
    const result = await handlePatchBotTask({
      botId: flow.id,
      taskId: ownTask.id,
      body: { status },
      bearerOk: true,
      deps: baseDeps({
        updateBotProjectTask: async (_taskId, patch) => ({ ...ownTask, status: patch.status }),
      }),
    });
    assert.equal(result.status, 200, `status ${status} allowed`);
    assert.equal(result.body.task.status, status);
  }

  const invalidStatusPatch = await handlePatchBotTask({
    botId: flow.id,
    taskId: ownTask.id,
    body: { status: "blocked" },
    bearerOk: true,
    deps: baseDeps(),
  });
  assert.equal(invalidStatusPatch.status, 400);

  let assigned = null;
  const assignHuman = await handlePatchBotTask({
    botId: flow.id,
    taskId: ownTask.id,
    body: { assignee_type: "human" },
    bearerOk: true,
    deps: baseDeps({
      updateBotProjectTask: async (taskId, patch, actor) => {
        assigned = { taskId, patch, actor };
        return { ...ownTask, assignee_type: "human", bot_id: null };
      },
    }),
  });
  assert.equal(assignHuman.status, 200);
  assert.equal(assigned.patch.assigneeType, "human");
  assert.equal(assigned.patch.botId, null);
  assert.equal(assigned.actor, "bot:Flow");

  const assignSelf = await handlePatchBotTask({
    botId: flow.id,
    taskId: ownTask.id,
    body: { assignee_type: "bot" },
    bearerOk: true,
    deps: baseDeps({
      updateBotProjectTask: async (_taskId, patch) => ({
        ...ownTask,
        assignee_type: patch.assigneeType,
        bot_id: patch.botId,
      }),
    }),
  });
  assert.equal(assignSelf.status, 200);
  assert.equal(assignSelf.body.task.assignee_type, "bot");
  assert.equal(assignSelf.body.task.bot_id, flow.id);

  const assignSameProjectBot = await handlePatchBotTask({
    botId: flow.id,
    taskId: ownTask.id,
    body: { assignee_type: "bot", bot_id: flowHelper.id },
    bearerOk: true,
    deps: baseDeps({
      updateBotProjectTask: async (_taskId, patch) => ({
        ...ownTask,
        assignee_type: patch.assigneeType,
        bot_id: patch.botId,
      }),
    }),
  });
  assert.equal(assignSameProjectBot.status, 200);
  assert.equal(assignSameProjectBot.body.task.bot_id, flowHelper.id);

  const assignForeignBot = await handlePatchBotTask({
    botId: flow.id,
    taskId: ownTask.id,
    body: { assignee_type: "bot", bot_id: home.id },
    bearerOk: true,
    deps: baseDeps(),
  });
  assert.equal(assignForeignBot.status, 403);
  assert.equal(assignForeignBot.body.error, "Bot does not belong to this project");

  const assignMissingBot = await handlePatchBotTask({
    botId: flow.id,
    taskId: ownTask.id,
    body: { assignee_type: "bot", bot_id: "00000000-0000-4000-8000-000000000000" },
    bearerOk: true,
    deps: baseDeps(),
  });
  assert.equal(assignMissingBot.status, 400);

  let archived = null;
  const archiveOk = await handlePatchBotTask({
    botId: flow.id,
    taskId: ownTask.id,
    body: { archived_at: "2026-09-25T10:00:00.000Z" },
    bearerOk: true,
    deps: baseDeps({
      updateBotProjectTask: async (taskId, patch, actor) => {
        archived = { taskId, patch, actor };
        return { ...ownTask, archived_at: "2026-09-25T10:00:00.000Z" };
      },
    }),
  });
  assert.equal(archiveOk.status, 200);
  assert.equal(archived.patch.archivedAt, "2026-09-25T10:00:00.000Z");
  assert.equal(archived.actor, "bot:Flow");

  const unarchiveOk = await handlePatchBotTask({
    botId: flow.id,
    taskId: ownTask.id,
    body: { archived_at: null },
    bearerOk: true,
    deps: baseDeps({
      updateBotProjectTask: async (_taskId, patch) => ({
        ...ownTask,
        archived_at: patch.archivedAt,
      }),
    }),
  });
  assert.equal(unarchiveOk.status, 200);
  assert.equal(unarchiveOk.body.task.archived_at, null);

  const blockedDoing = await handlePatchBotTask({
    botId: flow.id,
    taskId: ownTask.id,
    body: { status: "doing" },
    bearerOk: true,
    deps: baseDeps({
      updateBotProjectTask: async () => {
        throw new DependencyBlockError([
          { id: "blocker-1", title: "Dependencia", status: "inbox", archived_at: null },
        ]);
      },
    }),
  });
  assert.equal(blockedDoing.status, 409);
  assert.equal(blockedDoing.body.blockers.length, 1);

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

  const createUnauthorized = await handlePostBotTask({
    botId: flow.id,
    body: { title: "Inbox desde Flow" },
    bearerOk: false,
    deps: baseDeps(),
  });
  assert.equal(createUnauthorized.status, 401);

  const missingBot = await handlePostBotTask({
    botId: "missing-bot",
    body: { title: "Inbox desde Flow" },
    bearerOk: true,
    deps: baseDeps(),
  });
  assert.equal(missingBot.status, 404);
  assert.equal(missingBot.body.error, "Bot not found");

  let created = null;
  const createdOk = await handlePostBotTask({
    botId: flow.id,
    body: {
      title: "Inbox desde Flow",
      description: "Cuerpo markdown",
      priority: "medium",
    },
    bearerOk: true,
    deps: baseDeps({
      createBotProjectTask: async (projectId, input, actor) => {
        created = { projectId, input, actor };
        return {
          ...ownTask,
          id: "task-created",
          title: input.title,
          description: input.description,
          status: "inbox",
          assignee_type: input.assigneeType,
          bot_id: input.botId,
          priority: input.priority,
        };
      },
    }),
  });
  assert.equal(createdOk.status, 201, "create returns 201");
  assert.equal(createdOk.body.task.status, "inbox");
  assert.equal(createdOk.body.task.assignee_type, "human");
  assert.equal(createdOk.body.task.bot_id, null);
  assert.equal(createdOk.body.task.title, "Inbox desde Flow");
  assert.equal(created.projectId, flow.project_id);
  assert.equal(created.actor, "bot:Flow");
  assert.equal(created.input.assigneeType, "human");
  assert.equal(created.input.botId, null);

  const createdForBot = await handlePostBotTask({
    botId: flow.id,
    body: { title: "Para Flow", assignee_type: "bot" },
    bearerOk: true,
    deps: baseDeps(),
  });
  assert.equal(createdForBot.status, 201);
  assert.equal(createdForBot.body.task.assignee_type, "bot");
  assert.equal(createdForBot.body.task.bot_id, flow.id);
  assert.equal(createdForBot.body.task.status, "inbox");

  const createStatusRejected = await handlePostBotTask({
    botId: flow.id,
    body: { title: "No", status: "doing" },
    bearerOk: true,
    deps: baseDeps(),
  });
  assert.equal(createStatusRejected.status, 403);

  const createDup = await handlePostBotTask({
    botId: flow.id,
    body: { title: "Revisar leads" },
    bearerOk: true,
    deps: baseDeps({
      createBotProjectTask: async () => {
        throw new DuplicateTaskError([
          { id: ownTask.id, title: ownTask.title, status: "inbox", archived_at: null },
        ]);
      },
    }),
  });
  assert.equal(createDup.status, 409);
  assert.equal(createDup.body.duplicates.length, 1);
});

console.log("bot api ok");
