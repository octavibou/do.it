import type { TaskSummary } from "@/lib/types";

export class DependencyBlockError extends Error {
  blockers: TaskSummary[];

  constructor(blockers: TaskSummary[]) {
    super("No se puede pasar a En curso: hay bloqueadores sin terminar.");
    this.name = "DependencyBlockError";
    this.blockers = blockers;
  }
}

export class DuplicateTaskError extends Error {
  matches: TaskSummary[];

  constructor(matches: TaskSummary[]) {
    super("Hay tareas parecidas en este proyecto.");
    this.name = "DuplicateTaskError";
    this.matches = matches;
  }
}

export class AssigneeBotError extends Error {
  constructor(message = "Bot does not belong to this project") {
    super(message);
    this.name = "AssigneeBotError";
  }
}
