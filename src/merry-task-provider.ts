import {
  type Disposable,
  type Event,
  ShellExecution,
  Task,
  TaskGroup,
  type TaskProvider,
  TaskRevealKind,
  TaskScope,
} from "vscode";

import type { CliInfo } from "./cli-detector";
import type { ScriptNode } from "./merry-parser";
import type { MerryScriptService } from "./merry-script-service";
import { formatShellCommand } from "./shell-command";

export class MerryTaskProvider implements TaskProvider<Task>, Disposable {
  static readonly taskType = "merry";

  private cachedTasks: Task[] | undefined;
  private readonly disposables: Disposable[] = [];

  constructor(
    private readonly service: MerryScriptService,
    private readonly workspaceRoot: string,
    private readonly getCliInfo: () => CliInfo | null,
    private readonly refreshCliInfo: () => Promise<void>,
    onDidChangeCliInfo: Event<void>,
  ) {
    service.onDidChangeScripts(this.invalidateCache, this, this.disposables);
    onDidChangeCliInfo(this.invalidateCache, this, this.disposables);
  }

  async provideTasks(): Promise<Task[]> {
    await this.refreshCliInfo();
    if (!this.cachedTasks) {
      this.cachedTasks = this.buildTasks();
    }
    return this.cachedTasks;
  }

  resolveTask(_task: Task): Task | undefined {
    return undefined;
  }

  private buildTasks(): Task[] {
    const cliInfo = this.getCliInfo();
    if (!cliInfo) return [];
    return collectLeaves(this.service.getNodes()).map((node) =>
      this.nodeToTask(node, cliInfo),
    );
  }

  private nodeToTask(node: ScriptNode, cliInfo: CliInfo): Task {
    const task = new Task(
      { type: MerryTaskProvider.taskType, script: node.fullPath },
      TaskScope.Workspace,
      node.fullPath,
      MerryTaskProvider.taskType,
      new ShellExecution(
        formatShellCommand(
          [cliInfo.launcherPath, "run", ...node.fullPath.split(/\s+/)],
          process.platform === "win32" ? "cmd" : "posix",
          commandEnvironment(cliInfo.toolchain.environment),
        ),
        process.platform === "win32"
          ? {
              cwd: this.workspaceRoot,
              env: cliInfo.toolchain.environment,
              executable: "cmd.exe",
              shellArgs: ["/d", "/c"],
            }
          : {
              cwd: this.workspaceRoot,
              env: cliInfo.toolchain.environment,
              executable: "/bin/sh",
              shellArgs: ["-c"],
            },
      ),
    );
    task.detail = node.description ?? node.commands.join(" && ");
    task.group = resolveTaskGroup(node);
    task.presentationOptions = { reveal: TaskRevealKind.Always };
    return task;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }

  private invalidateCache(): void {
    this.cachedTasks = undefined;
  }
}

function commandEnvironment(
  environment: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  const result: Record<string, string> = {
    PATH: environment["PATH"],
    PUB_CACHE: environment["PUB_CACHE"],
  };
  if (environment["FLUTTER_ROOT"]) {
    result["FLUTTER_ROOT"] = environment["FLUTTER_ROOT"];
  }
  return result;
}

/** Recursively collect all non-group (runnable) leaf nodes. */
function collectLeaves(nodes: ScriptNode[]): ScriptNode[] {
  const leaves: ScriptNode[] = [];
  for (const node of nodes) {
    if (node.isGroup) {
      leaves.push(...collectLeaves(node.children));
    } else {
      leaves.push(node);
    }
  }
  return leaves;
}

/** Map a node to the appropriate VS Code TaskGroup, if any. */
function resolveTaskGroup(node: ScriptNode): TaskGroup | undefined {
  const p = node.fullPath.toLowerCase();
  const l = node.label.toLowerCase();
  if (p.startsWith("build")) return TaskGroup.Build;
  if (l === "test" || l === "pretest" || l === "posttest")
    return TaskGroup.Test;
  if (l === "clean" || p.startsWith("clean")) return TaskGroup.Clean;
  return undefined;
}
