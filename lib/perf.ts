type TimedResult<T> = {
  value: T;
  ms: number;
};

export async function measureAsync<T>(label: string, run: () => Promise<T>): Promise<TimedResult<T>> {
  const started = performance.now();
  const value = await run();
  return { value, ms: Math.round(performance.now() - started) };
}

export function logBoardOpen(details: {
  slug: string;
  taskCount: number;
  archivedCount: number;
  queryCount: number;
  timingsMs: Record<string, number>;
}): void {
  console.info(
    `[do.it:perf] board-open slug=${details.slug} tasks=${details.taskCount} archived=${details.archivedCount} queries=${details.queryCount} ms=${JSON.stringify(details.timingsMs)}`
  );
}

export function logProjectsList(details: {
  projectCount: number;
  queryCount: number;
  timingsMs: Record<string, number>;
}): void {
  console.info(
    `[do.it:perf] projects-list projects=${details.projectCount} queries=${details.queryCount} ms=${JSON.stringify(details.timingsMs)}`
  );
}
