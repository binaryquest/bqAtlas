import { filterCollection } from "./collection";

export interface AtlasLookupColumn<T> {
  key: keyof T & string;
  label: string;
  width?: number;
  align?: "left" | "right";
  format?: (row: T) => string;
  searchable?: boolean;
}

export function lookupCell<T>(row: T, column: AtlasLookupColumn<T>): string {
  return column.format ? column.format(row) : String(row[column.key] ?? "");
}

export function filterLookup<T>(
  rows: readonly T[],
  columns: readonly AtlasLookupColumn<T>[],
  query: string,
): T[] {
  return filterCollection(rows, query, (row) =>
    columns
      .filter((c) => c.searchable !== false)
      .map((c) => lookupCell(row, c))
      .join(" "),
  );
}

export function nextLookupIndex<T>(
  rows: readonly T[],
  current: number,
  key: string,
  disabled: (row: T) => boolean,
): number {
  const enabled = rows
    .map((row, i) => (disabled(row) ? -1 : i))
    .filter((i) => i >= 0);
  if (!enabled.length) return -1;
  if (key === "Home") return enabled[0];
  if (key === "End") return enabled.at(-1)!;
  const index = enabled.indexOf(current);
  if (index < 0) return key === "ArrowUp" ? enabled.at(-1)! : enabled[0];
  return enabled[
    (index + (key === "ArrowUp" ? -1 : 1) + enabled.length) % enabled.length
  ];
}
