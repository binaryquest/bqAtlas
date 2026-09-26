export interface AtlasEditColumn<T> {
  key: keyof T & string;
  label: string;
  type?: "text" | "number" | "select";
  readonly?: boolean;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: readonly { value: string; label: string; disabled?: boolean }[];
  format?: (row: T) => string;
}
export function validateEditRow<T extends object>(
  row: T,
  columns: readonly AtlasEditColumn<T>[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const column of columns) {
    if (column.readonly) continue;
    const value = row[column.key];
    if (value == null || String(value).trim() === "") {
      if (column.required) errors[column.key] = `${column.label} is required.`;
      continue;
    }
    if (column.type === "number") {
      const number = Number(value);
      if (!Number.isFinite(number))
        errors[column.key] = `${column.label} must be a number.`;
      else if (column.min !== undefined && number < column.min)
        errors[column.key] = `${column.label} must be at least ${column.min}.`;
      else if (column.max !== undefined && number > column.max)
        errors[column.key] = `${column.label} must be at most ${column.max}.`;
      else if (
        column.step &&
        Math.abs(
          (number - (column.min ?? 0)) / column.step -
            Math.round((number - (column.min ?? 0)) / column.step),
        ) > 1e-7
      )
        errors[column.key] =
          `${column.label} must use steps of ${column.step}.`;
    }
    if (
      column.type === "select" &&
      !column.options?.some(
        (option) => option.value === value && !option.disabled,
      )
    )
      errors[column.key] = `Choose an available ${column.label.toLowerCase()}.`;
  }
  return errors;
}
/** Replaces an existing row by stable key. Never mutates the source collection. */
export function replaceEditedRow<T extends object>(
  rows: readonly T[],
  draft: T,
  key: keyof T,
): T[] {
  if (!rows.some((row) => row[key] === draft[key]))
    throw new Error(
      "The edited row no longer exists. Cancel and reload the records.",
    );
  return rows.map((row) =>
    row[key] === draft[key] ? structuredClone(draft) : row,
  );
}
