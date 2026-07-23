export type TerminalShell = "posix" | "powershell" | "cmd";

function quotePosix(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function quotePowerShell(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function quoteCmd(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

export function formatShellCommand(
  words: readonly string[],
  shell: TerminalShell,
  environment: Readonly<Record<string, string>> = {},
): string {
  const entries = Object.entries(environment);
  if (shell === "powershell") {
    const command = `& ${words.map(quotePowerShell).join(" ")}`;
    if (entries.length === 0) return command;
    const assignments = entries
      .map(([key, value]) => `$env:${key} = ${quotePowerShell(value)}`)
      .join("; ");
    return `${assignments}; ${command}`;
  }
  if (shell === "cmd") {
    const command = words.map(quoteCmd).join(" ");
    if (entries.length === 0) return command;
    const assignments = entries
      .map(([key, value]) => `set ${quoteCmd(`${key}=${value}`)}`)
      .join(" && ");
    return `${assignments} && ${command}`;
  }
  const command = words.map(quotePosix).join(" ");
  if (entries.length === 0) return command;
  const assignments = entries
    .map(([key, value]) => quotePosix(`${key}=${value}`))
    .join(" ");
  return `env ${assignments} ${command}`;
}
