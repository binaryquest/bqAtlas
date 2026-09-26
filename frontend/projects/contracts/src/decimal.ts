/** Decimal text is parsed into integer units, never into a JavaScript Number. */
export function parseDecimalUnits(
  text: string | null | undefined,
  scale: number,
  maximum?: string,
): bigint | null {
  if (
    typeof text !== "string" ||
    text.length === 0 ||
    text.length > 30 ||
    !Number.isInteger(scale) ||
    scale < 0 ||
    scale > 28
  )
    return null;
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/.exec(text);
  if (!match || (match[2]?.length ?? 0) > scale) return null;
  const factor = 10n ** BigInt(scale);
  const units =
    BigInt(match[1]) * factor +
    BigInt((match[2] ?? "").padEnd(scale, "0") || "0");
  if (maximum !== undefined) {
    const limit = parseDecimalUnits(maximum, scale);
    if (limit === null)
      throw new Error("Maximum must be a valid decimal at the selected scale.");
    if (units > limit) return null;
  }
  return units;
}
export function formatDecimalUnits(units: bigint, scale: number): string {
  if (!Number.isInteger(scale) || scale < 0 || scale > 28)
    throw new Error("Invalid decimal scale.");
  const sign = units < 0n ? "-" : "";
  const digits = (units < 0n ? -units : units)
    .toString()
    .padStart(scale + 1, "0");
  return (
    sign +
    (scale === 0
      ? digits
      : digits.slice(0, -scale) + "." + digits.slice(-scale))
  );
}
