export type TerminalShell = "posix" | "powershell";

function quotePosix(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function quotePowerShell(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

export function formatShellCommand(
  words: readonly string[],
  shell: TerminalShell,
  environment: Readonly<Record<string, string | null>> = {},
): string {
  const entries = Object.entries(environment);
  if (shell === "powershell") {
    const command = `& ${words.map(quotePowerShell).join(" ")}`;
    if (entries.length === 0) return command;
    const assignments = entries
      .map(([key, value]) =>
        value === null
          ? `Remove-Item Env:${key} -ErrorAction SilentlyContinue`
          : `$env:${key} = ${quotePowerShell(value)}`,
      )
      .join("; ");
    return `${assignments}; ${command}`;
  }
  const command = words.map(quotePosix).join(" ");
  if (entries.length === 0) return command;
  const removals = entries
    .filter((entry): entry is [string, null] => entry[1] === null)
    .map(([key]) => `unset ${key}`)
    .join("; ");
  const assignments = entries
    .filter((entry): entry is [string, string] => entry[1] !== null)
    .map(([key, value]) => `${key}=${quotePosix(value)}`)
    .join(" ");
  const invocation = assignments ? `${assignments} ${command}` : command;
  return removals ? `${removals}; ${invocation}` : invocation;
}
