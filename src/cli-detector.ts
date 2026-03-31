import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export type MerryCli = "merry" | "derry";

export interface CliInfo {
  cli: MerryCli;
  /** Version string from `dart pub global list` output. Absent when detected via filesystem fallback. */
  version?: string;
  /** Absolute path to the CLI binary in the pub-cache bin directory. */
  binPath?: string;
}

/**
 * Detect which Merry-compatible CLI is installed globally via Dart pub.
 * Returns a CliInfo (merry preferred over derry), or null if neither is found.
 *
 * Strategy:
 * 1. `dart pub global list` — portable, works regardless of PUB_CACHE location.
 * 2. Filesystem fallback — checks ~/.pub-cache/global_packages when dart is unavailable.
 */
export async function detectMerryCli(): Promise<CliInfo | null> {
  const fromDartList = await detectViaDartGlobalList();
  if (fromDartList) {
    return { ...fromDartList, binPath: getCliBinPath(fromDartList.cli) };
  }
  return detectViaFilesystem();
}

function detectViaDartGlobalList(): Promise<Omit<CliInfo, "binPath"> | null> {
  return new Promise((resolve) => {
    // Use execFile (not exec) to avoid shell injection — args are static strings.
    cp.execFile(
      "dart",
      ["pub", "global", "list"],
      { timeout: 5000 },
      (err, stdout) => {
        if (err || !stdout) {
          resolve(null);
          return;
        }
        resolve(parseGlobalList(stdout));
      },
    );
  });
}

/**
 * Parse `dart pub global list` output.
 * Each line is: "packageName version"
 * Returns a CliInfo with cli + version when merry or derry is found (merry preferred).
 *
 * Exported for unit testing.
 */
export function parseGlobalList(
  output: string,
): Omit<CliInfo, "binPath"> | null {
  const lines = output.split("\n");
  let derryInfo: Omit<CliInfo, "binPath"> | null = null;

  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    const pkg = parts[0];
    const version = parts[1];

    if (pkg === "merry") {
      return { cli: "merry", version }; // merry takes priority — return immediately
    }
    if (pkg === "derry" && !derryInfo) {
      derryInfo = { cli: "derry", version };
    }
  }

  return derryInfo;
}

/**
 * Filesystem fallback when `dart` is not on PATH.
 * Checks `$PUB_CACHE/global_packages` (or `~/.pub-cache/global_packages`).
 */
function detectViaFilesystem(): CliInfo | null {
  const pubCacheRoot =
    process.env["PUB_CACHE"] ?? path.join(os.homedir(), ".pub-cache");
  const globalPackages = path.join(pubCacheRoot, "global_packages");

  try {
    const entries = fs.readdirSync(globalPackages);
    if (entries.includes("merry")) {
      return { cli: "merry", binPath: getCliBinPath("merry") };
    }
    if (entries.includes("derry")) {
      return { cli: "derry", binPath: getCliBinPath("derry") };
    }
  } catch {
    // PUB_CACHE not found or inaccessible — silently ignore
  }

  return null;
}

/**
 * Returns the absolute path to the CLI binary in `$PUB_CACHE/bin/`,
 * or undefined if the file does not exist.
 */
function getCliBinPath(cli: MerryCli): string | undefined {
  const pubCacheRoot =
    process.env["PUB_CACHE"] ?? path.join(os.homedir(), ".pub-cache");
  const binName = process.platform === "win32" ? `${cli}.bat` : cli;
  const binPath = path.join(pubCacheRoot, "bin", binName);
  return fs.existsSync(binPath) ? binPath : undefined;
}
