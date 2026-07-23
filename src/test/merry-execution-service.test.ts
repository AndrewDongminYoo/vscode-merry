import * as assert from "assert";

import type { CliInfo } from "../cli-detector";
import {
  executionShellForPlatform,
  formatTerminalCommand,
  MerryExecutionService,
} from "../merry-execution-service";
import type { ResolvedToolchainEnvironment } from "../toolchain-environment";

suite("MerryExecutionService", () => {
  test("quotes POSIX launcher and script as separate shell words", () => {
    assert.strictEqual(
      formatTerminalCommand(
        "/Volumes/External Cache/bin/merry",
        "build release; echo injected",
        "posix",
      ),
      "'/Volumes/External Cache/bin/merry' 'run' 'build' 'release;' 'echo' 'injected'",
    );
  });

  test("quotes embedded POSIX apostrophes", () => {
    assert.strictEqual(
      formatTerminalCommand("/cache/bin/merry", "customer's build", "posix"),
      "'/cache/bin/merry' 'run' 'customer'\"'\"'s' 'build'",
    );
  });

  test("quotes PowerShell metacharacters", () => {
    assert.strictEqual(
      formatTerminalCommand(
        "C:\\External Cache\\merry.bat",
        "build; Write-Output injected",
        "powershell",
      ),
      "& 'C:\\External Cache\\merry.bat' 'run' 'build;' 'Write-Output' 'injected'",
    );
  });

  test("preserves percent signs in PowerShell arguments", () => {
    assert.strictEqual(
      formatTerminalCommand(
        "C:\\SDK%20\\cache\\bin\\merry.bat",
        "build%20release",
        "powershell",
      ),
      "& 'C:\\SDK%20\\cache\\bin\\merry.bat' 'run' 'build%20release'",
    );
  });

  test("uses a known shell for each platform", () => {
    assert.deepStrictEqual(executionShellForPlatform("win32"), {
      shell: "powershell",
      shellPath: "powershell.exe",
    });
    assert.deepStrictEqual(executionShellForPlatform("darwin"), {
      shell: "posix",
      shellPath: "/bin/sh",
    });
    assert.deepStrictEqual(executionShellForPlatform("linux"), {
      shell: "posix",
      shellPath: "/bin/sh",
    });
  });

  test("reapplies the resolved environment in POSIX commands", () => {
    assert.strictEqual(
      formatTerminalCommand("/cache/bin/merry", "build", "posix", {
        PATH: "/flutter/bin:/cache/bin",
        PUB_CACHE: "/cache",
      }),
      "env 'PATH=/flutter/bin:/cache/bin' 'PUB_CACHE=/cache' '/cache/bin/merry' 'run' 'build'",
    );
  });

  test("reapplies the resolved environment in PowerShell commands", () => {
    assert.strictEqual(
      formatTerminalCommand("C:\\cache\\merry.bat", "build", "powershell", {
        PATH: "C:\\flutter\\bin;C:\\cache\\bin",
        PUB_CACHE: "C:\\cache",
      }),
      "$env:PATH = 'C:\\flutter\\bin;C:\\cache\\bin'; $env:PUB_CACHE = 'C:\\cache'; & 'C:\\cache\\merry.bat' 'run' 'build'",
    );
  });

  test("superseded refresh callers wait for the latest context", async () => {
    const firstDeferred = deferred<ResolvedToolchainEnvironment>();
    const first = toolchain("first");
    const second = toolchain("second");
    let resolutionCount = 0;
    const service = new MerryExecutionService(
      { subscriptions: [] },
      "/workspace",
      {
        resolveToolchain: async () => {
          resolutionCount += 1;
          return resolutionCount === 1 ? firstDeferred.promise : second;
        },
        detectCli: async (resolved) => detected(resolved),
      },
    );

    const firstRefresh = service.refresh();
    await new Promise<void>((resolve) => setImmediate(resolve));
    const secondRefresh = service.refresh();
    firstDeferred.resolve(first);
    await firstRefresh;

    assert.strictEqual(service.currentCliInfo?.toolchain.fingerprint, "second");
    await secondRefresh;
    service.dispose();
  });
});

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let complete = (_value: T): void => {
    throw new Error("Deferred promise was not initialized");
  };
  const promise = new Promise<T>((resolve) => {
    complete = resolve;
  });
  return { promise, resolve: (value) => complete(value) };
}

function toolchain(fingerprint: string): ResolvedToolchainEnvironment {
  return {
    kind: "resolved",
    dartExecutable: "/dart/bin/dart",
    pubCache: "/cache",
    environment: {
      PATH: "/dart/bin:/cache/bin",
      PUB_CACHE: "/cache",
    },
    sources: { dart: "path", pubCache: "merry-setting" },
    fingerprint,
  };
}

function detected(toolchain: ResolvedToolchainEnvironment): {
  readonly kind: "detected";
  readonly info: CliInfo;
} {
  return {
    kind: "detected",
    info: {
      cli: "merry",
      launcherPath: "/cache/bin/merry",
      toolchain,
    },
  };
}
