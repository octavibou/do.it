import type { TaskSummary } from "@/lib/types";

export type DependencyEdge = {
  blocker_task_id: string;
  blocked_task_id: string;
};

export function chunkIds(ids: string[], size = 120): string[][] {
  if (ids.length <= size) {
    return ids.length === 0 ? [] : [ids];
  }

  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += size) {
    chunks.push(ids.slice(index, index + size));
  }
  return chunks;
}

export function uniqueDependencyEdges(edges: DependencyEdge[]): DependencyEdge[] {
  const seen = new Set<string>();
  const unique: DependencyEdge[] = [];
  for (const edge of edges) {
    const key = `${edge.blocker_task_id}:${edge.blocked_task_id}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(edge);
  }
  return unique;
}

export function joinDependencyMaps(
  taskIds: string[],
  edges: DependencyEdge[],
  summaryOf: (id: string) => TaskSummary | null
): Map<string, { blocked_by: TaskSummary[]; blocks: TaskSummary[] }> {
  const maps = new Map<string, { blocked_by: TaskSummary[]; blocks: TaskSummary[] }>();
  for (const id of taskIds) {
    maps.set(id, { blocked_by: [], blocks: [] });
  }

  for (const edge of edges) {
    const blocker = summaryOf(edge.blocker_task_id);
    const blocked = summaryOf(edge.blocked_task_id);
    if (blocker) {
      maps.get(edge.blocked_task_id)?.blocked_by.push(blocker);
    }
    if (blocked) {
      maps.get(edge.blocker_task_id)?.blocks.push(blocked);
    }
  }

  return maps;
}
