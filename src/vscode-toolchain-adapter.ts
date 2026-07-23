import * as cp from "child_process";
import * as fs from "fs";
import * as yaml from "js-yaml";
import * as os from "os";
import * as path from "path";
import { Uri, workspace } from "vscode";

import {
  resolveToolchainEnvironment,
  type ToolchainResolution,
  type ToolchainResolverInput,
} from "./toolchain-environment";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function classifyWorkspace(workspaceRoot: string): "flutter" | "dart" {
  const pubspecPath = path.join(workspaceRoot, "pubspec.yaml");
  if (!fs.existsSync(pubspecPath)) return "dart";
  try {
    const document: unknown = yaml.load(fs.readFileSync(pubspecPath, "utf8"));
    if (!isRecord(document)) return "dart";
    for (const key of ["dependencies", "dev_dependencies"]) {
      const dependencies = document[key];
      if (!isRecord(dependencies)) continue;
      const flutter = dependencies["flutter"];
      if (isRecord(flutter) && flutter["sdk"] === "flutter") return "flutter";
    }
    return "dart";
  } catch (error) {
    if (error instanceof Error) return "dart";
    throw error;
  }
}

function runSdkCommand(
  command: string,
  environment: Readonly<Record<string, string>>,
  workspaceRoot: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    cp.exec(
      command,
      { cwd: workspaceRoot, env: environment, timeout: 5000 },
      (error, stdout) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout);
      },
    );
  });
}

function resolverInput(workspaceRoot: string): ToolchainResolverInput {
  const resource = Uri.file(workspaceRoot);
  const merry = workspace.getConfiguration("merry", resource);
  const dart = workspace.getConfiguration("dart", resource);
  return {
    workspaceRoot,
    workspaceTrusted: workspace.isTrusted,
    workspaceKind: classifyWorkspace(workspaceRoot),
    homeDirectory: os.homedir(),
    platform: process.platform,
    environment: process.env,
    merryDartSdkPath: merry.get<string>("dartSdkPath") || undefined,
    merryPubCachePath: merry.get<string>("pubCachePath") || undefined,
    dartFlutterSdkPath: dart.get<string>("flutterSdkPath") || undefined,
    dartSdkPath: dart.get<string>("sdkPath") || undefined,
    dartGetFlutterSdkCommand:
      dart.get<string>("getFlutterSdkCommand") || undefined,
    dartGetDartSdkCommand: dart.get<string>("getDartSdkCommand") || undefined,
  };
}

export function resolveWorkspaceToolchain(
  workspaceRoot: string,
): Promise<ToolchainResolution> {
  return resolveToolchainEnvironment(resolverInput(workspaceRoot), {
    runSdkCommand: (command, environment) =>
      runSdkCommand(command, environment, workspaceRoot),
  });
}
