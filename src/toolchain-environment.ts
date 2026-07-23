import * as fs from "fs";
import * as path from "path";

import {
  buildPath,
  definedEnvironment,
  findOnPath,
  inspectSdk,
  resolveConfiguredPath,
  type SdkCandidate,
  type ToolchainSource,
} from "./toolchain-paths";

export type { ToolchainSource } from "./toolchain-paths";

export type PubCacheSource = "merry-setting" | "environment" | "home-default";

export interface ToolchainResolverInput {
  readonly workspaceRoot: string;
  readonly workspaceTrusted: boolean;
  readonly workspaceKind: "flutter" | "dart";
  readonly homeDirectory: string;
  readonly platform: NodeJS.Platform;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly merryDartSdkPath?: string;
  readonly merryPubCachePath?: string;
  readonly dartFlutterSdkPath?: string;
  readonly dartSdkPath?: string;
  readonly dartGetFlutterSdkCommand?: string;
  readonly dartGetDartSdkCommand?: string;
}

export interface ToolchainResolverDependencies {
  readonly runSdkCommand: (
    command: string,
    environment: Readonly<Record<string, string>>,
  ) => Promise<string>;
}

export interface ResolvedToolchainEnvironment {
  readonly kind: "resolved";
  readonly dartExecutable: string;
  readonly flutterRoot?: string;
  readonly pubCache: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly sources: {
    readonly dart: ToolchainSource;
    readonly pubCache: PubCacheSource;
  };
  readonly fingerprint: string;
}

export type ToolchainResolution =
  | ResolvedToolchainEnvironment
  | { readonly kind: "workspace-untrusted" }
  | {
      readonly kind: "invalid-configuration";
      readonly setting: "merry.dartSdkPath" | "merry.pubCachePath";
      readonly reason: string;
    }
  | {
      readonly kind: "pub-cache-unavailable";
      readonly source: PubCacheSource;
      readonly path: string;
      readonly reason: string;
    }
  | {
      readonly kind: "dart-not-found";
      readonly checkedSources: readonly ToolchainSource[];
    };

async function commandCandidate(
  command: string | undefined,
  input: ToolchainResolverInput,
  dependencies: ToolchainResolverDependencies,
): Promise<SdkCandidate | null> {
  if (!command) return null;
  try {
    const output = await dependencies.runSdkCommand(
      command,
      definedEnvironment(input.environment),
    );
    const lines = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length !== 1) return null;
    return inspectSdk(lines[0], "dart-code-command", input.platform);
  } catch (error) {
    if (error instanceof Error) return null;
    throw error;
  }
}

function settingCandidate(
  value: string | undefined,
  input: ToolchainResolverInput,
): SdkCandidate | null {
  if (!value) return null;
  const configured = resolveConfiguredPath(value, input);
  if (configured.kind === "invalid" || !configured.path) return null;
  return inspectSdk(configured.path, "dart-code-setting", input.platform);
}

function resolveCache(input: ToolchainResolverInput):
  | {
      readonly kind: "resolved";
      readonly path: string;
      readonly source: PubCacheSource;
    }
  | Exclude<ToolchainResolution, ResolvedToolchainEnvironment> {
  let cachePath: string;
  let source: PubCacheSource;
  if (input.merryPubCachePath) {
    const configured = resolveConfiguredPath(input.merryPubCachePath, input);
    if (configured.kind === "invalid" || !configured.path) {
      return {
        kind: "invalid-configuration",
        setting: "merry.pubCachePath",
        reason: configured.reason ?? "Path could not be resolved",
      };
    }
    cachePath = configured.path;
    source = "merry-setting";
  } else if (input.environment["PUB_CACHE"]) {
    cachePath = path.resolve(input.environment["PUB_CACHE"]);
    source = "environment";
  } else {
    const localAppData =
      input.environment["LOCALAPPDATA"] ??
      path.join(input.homeDirectory, "AppData", "Local");
    cachePath =
      input.platform === "win32"
        ? path.join(localAppData, "Pub", "Cache")
        : path.join(input.homeDirectory, ".pub-cache");
    source = "home-default";
  }
  if (fs.existsSync(cachePath) && !fs.statSync(cachePath).isDirectory()) {
    return {
      kind: "pub-cache-unavailable",
      source,
      path: cachePath,
      reason: "Path is not a directory",
    };
  }
  const accessTarget = fs.existsSync(cachePath)
    ? cachePath
    : nearestExistingParent(cachePath);
  if (!accessTarget) {
    return {
      kind: "pub-cache-unavailable",
      source,
      path: cachePath,
      reason: "No existing parent directory is available",
    };
  }
  try {
    fs.accessSync(accessTarget, fs.constants.R_OK | fs.constants.W_OK);
  } catch (error) {
    if (!(error instanceof Error)) throw error;
    return {
      kind: "pub-cache-unavailable",
      source,
      path: cachePath,
      reason: fs.existsSync(cachePath)
        ? "Directory is not readable and writable"
        : "Parent directory is not readable and writable",
    };
  }
  return { kind: "resolved", path: cachePath, source };
}

function nearestExistingParent(target: string): string | null {
  let candidate = path.dirname(target);
  while (!fs.existsSync(candidate)) {
    const parent = path.dirname(candidate);
    if (parent === candidate) return null;
    candidate = parent;
  }
  return fs.statSync(candidate).isDirectory() ? candidate : null;
}

function takeEnvironmentValue(
  environment: Record<string, string>,
  name: string,
  caseInsensitive: boolean,
): string | undefined {
  const key = caseInsensitive
    ? Object.keys(environment).find(
        (candidate) => candidate.toLowerCase() === name.toLowerCase(),
      )
    : name;
  if (!key) return undefined;
  const value = environment[key];
  if (key !== name) delete environment[key];
  return value;
}

function deleteEnvironmentValue(
  environment: Record<string, string>,
  name: string,
  caseInsensitive: boolean,
): void {
  if (!caseInsensitive) {
    delete environment[name];
    return;
  }
  for (const key of Object.keys(environment)) {
    if (key.toLowerCase() === name.toLowerCase()) delete environment[key];
  }
}

export async function resolveToolchainEnvironment(
  input: ToolchainResolverInput,
  dependencies: ToolchainResolverDependencies,
): Promise<ToolchainResolution> {
  if (!input.workspaceTrusted) return { kind: "workspace-untrusted" };

  const checkedSources: ToolchainSource[] = [];
  let selected: SdkCandidate | null = null;
  if (input.merryDartSdkPath) {
    const configured = resolveConfiguredPath(input.merryDartSdkPath, input);
    if (configured.kind === "invalid" || !configured.path) {
      return {
        kind: "invalid-configuration",
        setting: "merry.dartSdkPath",
        reason: configured.reason ?? "Path could not be resolved",
      };
    }
    selected = inspectSdk(configured.path, "merry-setting", input.platform);
    if (!selected) {
      return {
        kind: "invalid-configuration",
        setting: "merry.dartSdkPath",
        reason: "Path is not a Dart or Flutter SDK root",
      };
    }
  }

  const implicit: Array<() => Promise<SdkCandidate | null>> =
    input.workspaceKind === "flutter"
      ? [
          async () => settingCandidate(input.dartFlutterSdkPath, input),
          () =>
            commandCandidate(
              input.dartGetFlutterSdkCommand,
              input,
              dependencies,
            ),
          async () =>
            inspectSdk(
              path.join(input.workspaceRoot, ".fvm", "flutter_sdk"),
              "fvm",
              input.platform,
            ),
        ]
      : [
          async () => settingCandidate(input.dartSdkPath, input),
          () =>
            commandCandidate(input.dartGetDartSdkCommand, input, dependencies),
        ];
  for (const resolveCandidate of implicit) {
    if (selected) break;
    selected = await resolveCandidate();
  }
  if (!selected && input.environment["FLUTTER_ROOT"]) {
    selected = inspectSdk(
      input.environment["FLUTTER_ROOT"],
      "flutter-root",
      input.platform,
    );
  }
  selected ??= findOnPath(input);
  if (!selected) return { kind: "dart-not-found", checkedSources };

  const cache = resolveCache(input);
  if (cache.kind !== "resolved") return cache;
  const environment = definedEnvironment(input.environment);
  environment["PUB_CACHE"] = cache.path;
  const caseInsensitive = input.platform === "win32";
  if (selected.flutterRoot) {
    environment["FLUTTER_ROOT"] = selected.flutterRoot;
  } else {
    deleteEnvironmentValue(environment, "FLUTTER_ROOT", caseInsensitive);
  }
  const inheritedPath = takeEnvironmentValue(
    environment,
    "PATH",
    caseInsensitive,
  );
  environment["PATH"] = buildPath(
    selected,
    cache.path,
    inheritedPath,
    input.platform,
  );
  const fingerprint = JSON.stringify([
    input.workspaceRoot,
    selected.dartExecutable,
    selected.flutterRoot ?? "",
    cache.path,
    environment["PATH"],
  ]);
  return {
    kind: "resolved",
    dartExecutable: selected.dartExecutable,
    flutterRoot: selected.flutterRoot,
    pubCache: cache.path,
    environment,
    sources: { dart: selected.source, pubCache: cache.source },
    fingerprint,
  };
}
