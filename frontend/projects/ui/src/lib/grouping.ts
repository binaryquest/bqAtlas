import { AtlasTableQuery } from "./table-query";

export interface AtlasSummary<T> {
  key: string;
  label: string;
  /** Receives a precise scope: current page/group or all locally filtered rows. */
  aggregate: (rows: readonly T[]) => string;
}
export interface AtlasServerSummary {
  /** Echo the request token; stale responses are never displayed. */
  queryKey: string;
  scope: "query";
  values: Readonly<Record<string, string>>;
}
export function atlasSummaryQueryKey(query: AtlasTableQuery): string {
  return JSON.stringify({
    ...query,
    filters: Object.fromEntries(
      Object.entries(query.filters).sort(([a], [b]) => a.localeCompare(b)),
    ),
  });
}
export function atlasHeaderBands(
  columns: readonly { group?: string }[],
): { label: string; span: number }[] {
  const bands: { label: string; span: number }[] = [];
  for (const column of columns) {
    const label = column.group ?? "";
    const last = bands.at(-1);
    if (last && last.label === label) last.span++;
    else bands.push({ label, span: 1 });
  }
  return bands;
}
export function atlasGroupRows<T>(
  rows: readonly T[],
  key: (row: T) => string,
): { key: string; rows: T[] }[] {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    const group = groups.get(id);
    if (group) group.push(row);
    else groups.set(id, [row]);
  }
  return [...groups].map(([key, rows]) => ({ key, rows }));
}
/** Exact fixed-scale signed decimal sum. Invalid precision is rejected, never rounded. */
export function atlasSumDecimal(values: readonly string[], scale = 2): string {
  if (!Number.isInteger(scale) || scale < 0 || scale > 28)
    throw new Error("Invalid decimal scale.");
  let total = 0n;
  for (const value of values) {
    const match = /^(-?)(0|[1-9]\d*)(?:\.(\d+))?$/.exec(value);
    if (!match || value.length > 100 || (match[3]?.length ?? 0) > scale)
      throw new Error("Invalid decimal value or precision.");
    const units =
      BigInt(match[2]) * 10n ** BigInt(scale) +
      BigInt((match[3] ?? "").padEnd(scale, "0") || "0");
    total += match[1] ? -units : units;
  }
  const digits = (total < 0n ? -total : total)
    .toString()
    .padStart(scale + 1, "0");
  return (
    (total < 0n ? "-" : "") +
    (scale ? digits.slice(0, -scale) + "." + digits.slice(-scale) : digits)
  );
}
