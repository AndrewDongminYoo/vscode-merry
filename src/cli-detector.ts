import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";

import type { ResolvedToolchainEnvironment } from "./toolchain-environment";

export type MerryCli = "merry" | "derry";

export interface CliInfo {
  readonly cli: MerryCli;
  readonly version?: string;
  readonly launcherPath: string;
  readonly toolchain: ResolvedToolchainEnvironment;
}

export type CliDetectionResult =
  | { readonly kind: "detected"; readonly info: CliInfo }
  | { readonly kind: "not-installed" }
  | {
      readonly kind: "launcher-missing";
      readonly cli: MerryCli;
      readonly expectedPath: string;
    };

export interface CliDetectorDependencies {
  readonly runGlobalList: (
    executable: string,
    args: readonly string[],
    environment: Readonly<Record<string, string>>,
  ) => Promise<string>;
}

const defaultDependencies: CliDetectorDependencies = {
  runGlobalList: (executable, args, environment) => {
    return new Promise((resolve, reject) => {
      cp.execFile(
        executable,
        [...args],
        { env: environment, timeout: 5000 },
        (error, stdout) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(stdout);
        },
      );
    });
  },
};

export async function detectMerryCli(
  toolchain: ResolvedToolchainEnvironment,
  dependencies: CliDetectorDependencies = defaultDependencies,
): Promise<CliDetectionResult> {
  let packageInfo: Omit<CliInfo, "launcherPath" | "toolchain"> | null = null;
  try {
    const output = await dependencies.runGlobalList(
      toolchain.dartExecutable,
      ["pub", "global", "list"],
      toolchain.environment,
    );
    packageInfo = parseGlobalList(output);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    packageInfo = detectViaFilesystem(toolchain.pubCache);
  }
  if (!packageInfo) return { kind: "not-installed" };

  const launcherPath = getLauncherPath(packageInfo.cli, toolchain.pubCache);
  if (!isRunnableLauncher(launcherPath)) {
    return {
      kind: "launcher-missing",
      cli: packageInfo.cli,
      expectedPath: launcherPath,
    };
  }
  return {
    kind: "detected",
    info: {
      ...packageInfo,
      launcherPath,
      toolchain,
    },
  };
}

function isRunnableLauncher(launcherPath: string): boolean {
  try {
    if (!fs.statSync(launcherPath).isFile()) return false;
    if (process.platform !== "win32") {
      fs.accessSync(launcherPath, fs.constants.X_OK);
    }
    return true;
  } catch (error) {
    if (error instanceof Error) return false;
    throw error;
  }
}

export function parseGlobalList(
  output: string,
): Omit<CliInfo, "launcherPath" | "toolchain"> | null {
  const lines = output.split("\n");
  let derryInfo: Omit<CliInfo, "launcherPath" | "toolchain"> | null = null;

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    const pkg = parts[0];
    const version = parts[1];

    if (pkg === "merry") return { cli: "merry", version };
    if (pkg === "derry" && !derryInfo) {
      derryInfo = { cli: "derry", version };
    }
  }

  return derryInfo;
}

function detectViaFilesystem(
  pubCache: string,
): Omit<CliInfo, "launcherPath" | "toolchain"> | null {
  const globalPackages = path.join(pubCache, "global_packages");
  if (!fs.existsSync(globalPackages)) return null;
  try {
    const entries = fs.readdirSync(globalPackages);
    if (entries.includes("merry")) return { cli: "merry" };
    if (entries.includes("derry")) return { cli: "derry" };
    return null;
  } catch (error) {
    if (error instanceof Error) return null;
    throw error;
  }
}

function getLauncherPath(cli: MerryCli, pubCache: string): string {
  const binName = process.platform === "win32" ? `${cli}.bat` : cli;
  return path.join(pubCache, "bin", binName);
}
