/** Shared presentation definitions. Applications must authorize execution again at their command boundary. */
export interface AtlasCommand {
  id: string;
  label: string;
  icon?: string;
  primary?: boolean;
  disabled?: boolean;
  hidden?: boolean;
  permission?: string;
  group?: string;
}
export function atlasVisibleCommands(
  commands: readonly AtlasCommand[],
  permissions: readonly string[],
): AtlasCommand[] {
  return commands.filter(
    (command) =>
      !command.hidden &&
      (!command.permission || permissions.includes(command.permission)),
  );
}
export function atlasCommandAllowed(
  commands: readonly AtlasCommand[],
  id: string,
  permissions: readonly string[],
  disabled = false,
): boolean {
  return (
    !disabled &&
    atlasVisibleCommands(commands, permissions).some(
      (command) => command.id === id && !command.disabled,
    )
  );
}
/** Reserve room for overflow only when all commands cannot fit. */
export function atlasToolbarCapacity(
  widths: readonly number[],
  available: number,
  more = 84,
  gap = 8,
): number {
  const total =
    widths.reduce((sum, width) => sum + width, 0) +
    Math.max(0, widths.length - 1) * gap;
  if (total <= available) return widths.length;
  let used = more;
  let count = 0;
  for (const width of widths) {
    if (used + width + gap > available) break;
    used += width + gap;
    count++;
  }
  return count;
}
