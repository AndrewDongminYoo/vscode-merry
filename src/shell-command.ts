export type TerminalShell = "posix" | "powershell" | "cmd";

function quotePosix(value: string): string {
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

function quotePowerShell(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function quoteCmd(value: string): string {
  return `"${value.replaceAll("%", "%%").replaceAll('"', '""')}"`;
}

export function formatShellCommand(
  words: readonly string[],
  shell: TerminalShell,
): string {
  if (shell === "powershell") {
    return `& ${words.map(quotePowerShell).join(" ")}`;
  }
  if (shell === "cmd") return words.map(quoteCmd).join(" ");
  return words.map(quotePosix).join(" ");
}
