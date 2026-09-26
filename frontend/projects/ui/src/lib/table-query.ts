/** JSON-serializable, backend-independent collection request. Pages are zero based. */
export interface AtlasSort {
  key: string;
  direction: "asc" | "desc";
}
export interface AtlasTableQuery {
  page: number;
  pageSize: number;
  search: string;
  filters: Record<string, string>;
  sort: AtlasSort[];
}
export function sortByColumns<T>(
  rows: readonly T[],
  sorts: readonly AtlasSort[],
  value: (row: T, key: string) => unknown,
): T[] {
  return [...rows].sort((a, b) => {
    for (const sort of sorts) {
      const left = value(a, sort.key),
        right = value(b, sort.key);
      if (left == null || right == null) {
        if (left == null && right == null) continue;
        return left == null ? 1 : -1;
      }
      const comparison =
        typeof left === "number" && typeof right === "number"
          ? left - right
          : String(left).localeCompare(String(right), undefined, {
              numeric: true,
              sensitivity: "base",
            });
      if (comparison) return comparison * (sort.direction === "asc" ? 1 : -1);
    }
    return 0;
  });
}
export function matchesColumnFilters<T>(
  row: T,
  filters: Record<string, string>,
  value: (row: T, key: string) => string,
): boolean {
  return Object.entries(filters).every(([key, term]) =>
    value(row, key)
      .toLocaleLowerCase()
      .includes(term.trim().toLocaleLowerCase()),
  );
}
/** Cancels previous work and rejects stale completions even when an adapter ignores AbortSignal. */
export class AtlasLatestRequest {
  private controller?: AbortController;
  async run<T>(
    request: (signal: AbortSignal) => Promise<T>,
    accept: (result: T) => void,
    reject: (error: unknown) => void,
  ): Promise<void> {
    this.cancel();
    const controller = (this.controller = new AbortController());
    try {
      const result = await request(controller.signal);
      if (!controller.signal.aborted) accept(result);
    } catch (error) {
      if (!controller.signal.aborted) reject(error);
    }
  }
  cancel() {
    this.controller?.abort();
  }
}
