import * as fs from "fs";
import * as path from "path";

import type { ToolchainResolverInput } from "./toolchain-environment";

export type ToolchainSource =
  | "merry-setting"
  | "dart-code-setting"
  | "dart-code-command"
  | "fvm"
  | "flutter-root"
  | "path";

export interface SdkCandidate {
  readonly root: string;
  readonly dartExecutable: string;
  readonly flutterRoot?: string;
  readonly source: ToolchainSource;
}

export interface ResolvedPath {
  readonly kind: "resolved" | "invalid";
  readonly path?: string;
  readonly reason?: string;
}

export function resolveConfiguredPath(
  value: string,
  input: ToolchainResolverInput,
): ResolvedPath {
  let resolved = value.replaceAll("${workspaceFolder}", input.workspaceRoot);
  resolved = resolved.replace(/\$\{env:([^}]+)\}/g, (_match, name: string) => {
    return input.environment[name] ?? `\0${name}`;
  });
  const missingIndex = resolved.indexOf("\0");
  if (missingIndex >= 0) {
    return {
      kind: "invalid",
      reason: `Environment variable ${resolved.slice(missingIndex + 1)} is not set`,
    };
  }
  if (resolved === "~") {
    resolved = input.homeDirectory;
  } else if (/^~[\\/]/.test(resolved)) {
    resolved = path.join(input.homeDirectory, resolved.slice(2));
  }
  return {
    kind: "resolved",
    path: path.resolve(input.workspaceRoot, resolved),
  };
}

export function inspectSdk(
  root: string,
  source: ToolchainSource,
  platform: NodeJS.Platform,
): SdkCandidate | null {
  const executable = platform === "win32" ? "dart.exe" : "dart";
  const flutterDart = path.join(
    root,
    "bin",
    "cache",
    "dart-sdk",
    "bin",
    executable,
  );
  if (fs.existsSync(flutterDart)) {
    return {
      root,
      dartExecutable: flutterDart,
      flutterRoot: root,
      source,
    };
  }
  const standaloneDart = path.join(root, "bin", executable);
  if (fs.existsSync(standaloneDart)) {
    return { root, dartExecutable: standaloneDart, source };
  }
  return null;
}

export function findOnPath(input: ToolchainResolverInput): SdkCandidate | null {
  const executable = input.platform === "win32" ? "dart.exe" : "dart";
  const entries = input.environment["PATH"]?.split(path.delimiter) ?? [];
  for (const entry of entries) {
    if (!entry) continue;
    const dartExecutable = path.join(entry, executable);
    if (fs.existsSync(dartExecutable)) {
      return {
        root: path.dirname(entry),
        dartExecutable,
        source: "path",
      };
    }
  }
  return null;
}

export function definedEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(environment)) {
    if (value !== undefined) result[key] = value;
  }
  return result;
}

export function buildPath(
  selected: SdkCandidate,
  pubCache: string,
  inheritedPath: string | undefined,
  platform: NodeJS.Platform,
): string {
  const sdkBin = selected.flutterRoot
    ? path.join(selected.flutterRoot, "bin")
    : path.join(selected.root, "bin");
  const inherited = inheritedPath?.split(path.delimiter) ?? [];
  const caseSensitive = platform !== "win32";
  const ordered = [sdkBin, path.join(pubCache, "bin"), ...inherited];
  return ordered
    .filter(Boolean)
    .filter((entry, index, entries) => {
      const normalized = caseSensitive ? entry : entry.toLowerCase();
      return (
        entries.findIndex((candidate) => {
          return (
            (caseSensitive ? candidate : candidate.toLowerCase()) === normalized
          );
        }) === index
      );
    })
    .join(path.delimiter);
}
