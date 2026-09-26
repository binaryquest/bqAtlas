export interface AtlasDateRange {
  start: string;
  end: string;
}

/** Calendar date only. Never converts a business date through a timezone. */
export function validCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return (
    year > 0 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <=
      [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
  );
}
export function dateRangeError(
  range: AtlasDateRange,
  min = "",
  max = "",
): string {
  if (!range.start && !range.end) return "";
  if (!range.start || !range.end) return "Enter both dates.";
  if (!validCalendarDate(range.start) || !validCalendarDate(range.end))
    return "Enter valid calendar dates.";
  if (range.end < range.start)
    return "End date must be on or after start date.";
  if (min && range.start < min) return `Start date must be on or after ${min}.`;
  if (max && range.end > max) return `End date must be on or before ${max}.`;
  return "";
}
export function toggleChoice(
  values: readonly string[],
  key: string,
  limit = 0,
): string[] {
  if (values.includes(key)) return values.filter((v) => v !== key);
  return limit > 0 && values.length >= limit ? [...values] : [...values, key];
}
/** Accept locale decimal/group separators and ASCII digits; reject partial/ambiguous input. */
export function parseLocaleNumber(
  text: string,
  locale: string,
): number | null | undefined {
  const value = text.trim();
  if (!value) return null;
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6);
  const decimal = parts.find((p) => p.type === "decimal")?.value ?? ".";
  const group = parts.find((p) => p.type === "group")?.value ?? ",";
  const segments = value.split(decimal);
  if (segments.length > 2) return undefined;
  let integer = segments[0];
  if (integer.includes(group)) {
    const groups = integer.replace(/^[+-]/, "").split(group);
    if (
      !/^\d{1,3}$/.test(groups[0]) ||
      groups.slice(1).some((g) => !/^\d{3}$/.test(g))
    )
      return undefined;
    integer = integer.split(group).join("");
  }
  const normalized = integer + (segments.length === 2 ? "." + segments[1] : "");
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return undefined;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : undefined;
}
