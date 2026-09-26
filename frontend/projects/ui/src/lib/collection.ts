/** Shared collection behavior for list and table presentations. Never mutates consumer data. */
export function filterCollection<T>(
  rows: readonly T[],
  query: string,
  text: (row: T) => string,
): T[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return rows.filter((row) => {
    const haystack = text(row).toLocaleLowerCase();
    return terms.every((term) => haystack.includes(term));
  });
}

export function sortCollection<T>(
  rows: readonly T[],
  value: (row: T) => unknown,
  direction: "asc" | "desc" = "asc",
): T[] {
  const multiplier = direction === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = value(a),
      right = value(b);
    // Empty values stay at the end in either direction.
    if (left == null) return right == null ? 0 : 1;
    if (right == null) return -1;
    const result =
      typeof left === "number" && typeof right === "number"
        ? left - right
        : String(left).localeCompare(String(right), undefined, {
            numeric: true,
            sensitivity: "base",
          });
    return result * multiplier;
  });
}

export function pageCollection<T>(
  rows: readonly T[],
  page: number,
  pageSize: number,
) {
  const size = Number.isFinite(pageSize)
    ? Math.max(1, Math.floor(pageSize))
    : 10;
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Number.isFinite(page)
    ? Math.max(0, Math.min(Math.floor(page), pages - 1))
    : 0;
  return {
    items: rows.slice(current * size, (current + 1) * size),
    page: current,
    pages,
    total: rows.length,
    size,
  };
}

export interface AtlasOption<T = string> {
  label: string;
  value: T;
  description?: string;
  group?: string;
  disabled?: boolean;
}
