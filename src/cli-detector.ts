import * as cp from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

export type MerryCli = "merry" | "derry";

/**
 * Detect which Merry-compatible CLI is installed globally via Dart pub.
 * Returns "merry" (preferred) or "derry" if found, otherwise null.
 *
 * Strategy:
 * 1. `dart pub global list` — portable, works regardless of PUB_CACHE location.
 * 2. Filesystem fallback — checks ~/.pub-cache/global_packages when dart is unavailable.
 */
export async function detectMerryCli(): Promise<MerryCli | null> {
  const fromDartList = await detectViaDartGlobalList();
  if (fromDartList) {
    return fromDartList;
  }
  return detectViaFilesystem();
}

function detectViaDartGlobalList(): Promise<MerryCli | null> {
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
 * Returns "merry" immediately if found (priority), otherwise "derry" if found.
 *
 * Exported for unit testing.
 */
export function parseGlobalList(output: string): MerryCli | null {
  const lines = output.split("\n");
  let hasDerry = false;

  for (const line of lines) {
    const pkg = line.trim().split(/\s+/)[0];
    if (pkg === "merry") {
      return "merry";
    }
    if (pkg === "derry") {
      hasDerry = true;
    }
  }

  return hasDerry ? "derry" : null;
}

/**
 * Filesystem fallback when `dart` is not on PATH.
 * Checks `$PUB_CACHE/global_packages` (or `~/.pub-cache/global_packages`).
 */
function detectViaFilesystem(): MerryCli | null {
  const pubCacheRoot =
    process.env["PUB_CACHE"] ?? path.join(os.homedir(), ".pub-cache");
  const globalPackages = path.join(pubCacheRoot, "global_packages");

  try {
    const entries = fs.readdirSync(globalPackages);
    if (entries.includes("merry")) {
      return "merry";
    }
    if (entries.includes("derry")) {
      return "derry";
    }
  } catch {
    // PUB_CACHE not found or inaccessible — silently ignore
  }

  return null;
}
