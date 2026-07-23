import * as assert from "assert";

import { formatTerminalCommand } from "../merry-execution-service";

suite("MerryExecutionService", () => {
  test("quotes POSIX launcher and script as separate shell words", () => {
    assert.strictEqual(
      formatTerminalCommand(
        "/Volumes/External Cache/bin/merry",
        "build release; echo injected",
        "posix",
      ),
      "'/Volumes/External Cache/bin/merry' 'run' 'build release; echo injected'",
    );
  });

  test("quotes embedded POSIX apostrophes", () => {
    assert.strictEqual(
      formatTerminalCommand("/cache/bin/merry", "customer's build", "posix"),
      "'/cache/bin/merry' 'run' 'customer'\"'\"'s build'",
    );
  });

  test("quotes PowerShell metacharacters", () => {
    assert.strictEqual(
      formatTerminalCommand(
        "C:\\External Cache\\merry.bat",
        "build; Write-Output injected",
        "powershell",
      ),
      "& 'C:\\External Cache\\merry.bat' 'run' 'build; Write-Output injected'",
    );
  });

  test("quotes cmd metacharacters", () => {
    assert.strictEqual(
      formatTerminalCommand(
        "C:\\External Cache\\merry.bat",
        "build & echo injected",
        "cmd",
      ),
      '"C:\\External Cache\\merry.bat" "run" "build & echo injected"',
    );
  });
});
