import assert from "node:assert/strict";

import { findSimilarTitles, isStrongTitleMatch, normalizeTitle } from "../lib/duplicates.ts";
import { PRIORITY_LABELS } from "../lib/labels.ts";
import {
  canEnterDoing,
  compareTasks,
  incompleteBlockers,
  isOverdue,
  isShortBody,
  sortTasks,
} from "../lib/task-rules.ts";

assert.equal(normalizeTitle("  Sincronizar  CRM  "), "sincronizar crm");
assert.equal(isStrongTitleMatch("Revisar leads de la semana", "revisar leads de la semana"), true);
assert.equal(isStrongTitleMatch("Revisar leads de la semana", "Comprar café"), false);
assert.equal(isStrongTitleMatch("Sincronizar CRM de Leadflow", "sincronizar crm"), true);

const matches = findSimilarTitles("Revisar leads de la semana", [
  { id: "1", title: "Revisar leads de la semana", status: "inbox", archived_at: null },
  { id: "2", title: "Comprar café", status: "inbox", archived_at: null },
  { id: "3", title: "Revisar leads de la semana", status: "done", archived_at: "2026-01-01" },
]);
assert.deepEqual(
  matches.map((row) => row.id),
  ["1"]
);

assert.deepEqual(
  [PRIORITY_LABELS.urgent, PRIORITY_LABELS.high, PRIORITY_LABELS.medium, PRIORITY_LABELS.low],
  ["urgente", "alta", "normal", "baja"]
);

const sorted = sortTasks([
  { priority: "low", due_at: null, created_at: "2026-01-02T00:00:00.000Z" },
  { priority: "urgent", due_at: null, created_at: "2026-01-03T00:00:00.000Z" },
  { priority: "high", due_at: "2026-02-02T00:00:00.000Z", created_at: "2026-01-01T00:00:00.000Z" },
  { priority: "high", due_at: "2026-02-01T00:00:00.000Z", created_at: "2026-01-04T00:00:00.000Z" },
]);
assert.deepEqual(
  sorted.map((task) => task.priority + ":" + (task.due_at ?? "none")),
  ["urgent:none", "high:2026-02-01T00:00:00.000Z", "high:2026-02-02T00:00:00.000Z", "low:none"]
);
assert.ok(compareTasks(sorted[0], sorted[1]) < 0);

const blockers = incompleteBlockers([
  { id: "a", title: "A", status: "done", archived_at: null },
  { id: "b", title: "B", status: "inbox", archived_at: null },
]);
assert.deepEqual(
  blockers.map((row) => row.id),
  ["b"]
);
assert.equal(canEnterDoing(blockers), false);
assert.equal(canEnterDoing(blockers, true), true);
assert.equal(canEnterDoing([]), true);

assert.equal(isShortBody(""), true);
assert.equal(isShortBody("corto"), true);
assert.equal(isShortBody("x".repeat(40)), false);

assert.equal(isOverdue("2020-01-01T00:00:00.000Z", "inbox", Date.parse("2026-01-01T00:00:00.000Z")), true);
assert.equal(isOverdue("2020-01-01T00:00:00.000Z", "done", Date.parse("2026-01-01T00:00:00.000Z")), false);
assert.equal(isOverdue(null, "inbox"), false);

console.log("v2 rules ok");
