import type { TaskStatus } from "@/lib/types";

export type TitleRecord = {
  id: string;
  title: string;
  status: TaskStatus;
  archived_at: string | null;
};

export function normalizeTitle(title: string): string {
  return title
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleTokens(title: string): string[] {
  return normalizeTitle(title)
    .split(" ")
    .filter((token) => token.length >= 3);
}

export function isStrongTitleMatch(left: string, right: string): boolean {
  const a = normalizeTitle(left);
  const b = normalizeTitle(right);
  if (!a || !b) {
    return false;
  }
  if (a === b) {
    return true;
  }

  if (a.includes(b) || b.includes(a)) {
    const shorter = a.length < b.length ? a : b;
    if (shorter.length >= 8) {
      return true;
    }
  }

  const leftTokens = new Set(titleTokens(left));
  const rightTokens = new Set(titleTokens(right));
  if (leftTokens.size === 0 || rightTokens.size === 0) {
    return false;
  }

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) {
      intersection += 1;
    }
  }

  const union = leftTokens.size + rightTokens.size - intersection;
  const jaccard = intersection / union;
  const coverage = intersection / Math.min(leftTokens.size, rightTokens.size);
  return jaccard >= 0.5 || (intersection >= 2 && coverage >= 0.6);
}

export function findSimilarTitles(
  title: string,
  existing: TitleRecord[],
  excludeId?: string
): TitleRecord[] {
  const needle = title.trim();
  if (!needle) {
    return [];
  }

  return existing.filter(
    (row) =>
      row.id !== excludeId &&
      !row.archived_at &&
      isStrongTitleMatch(needle, row.title)
  );
}
