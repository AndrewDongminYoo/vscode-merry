import {
  type Disposable,
  ShellExecution,
  Task,
  TaskGroup,
  TaskRevealKind,
  TaskScope,
} from "vscode";

import type { MerryCli } from "./cli-detector";
import type { ScriptNode } from "./merry-parser";
import type { MerryScriptService } from "./merry-script-service";

export class MerryTaskProvider implements Disposable {
  static readonly taskType = "merry";

  private cachedTasks: Task[] | undefined;
  private readonly disposables: Disposable[] = [];

  constructor(
    private readonly service: MerryScriptService,
    private readonly getCli: () => MerryCli,
  ) {
    service.onDidChangeScripts(
      () => {
        this.cachedTasks = undefined;
      },
      this,
      this.disposables,
    );
  }

  provideTasks(): Task[] {
    if (!this.cachedTasks) {
      this.cachedTasks = this.buildTasks();
    }
    return this.cachedTasks;
  }

  resolveTask(_task: Task): Task | undefined {
    return undefined;
  }

  private buildTasks(): Task[] {
    const cli = this.getCli();
    return collectLeaves(this.service.getNodes()).map((node) =>
      this.nodeToTask(node, cli),
    );
  }

  private nodeToTask(node: ScriptNode, cli: MerryCli): Task {
    const task = new Task(
      { type: MerryTaskProvider.taskType, script: node.fullPath },
      TaskScope.Workspace,
      node.fullPath,
      "merry",
      new ShellExecution(`${cli} run ${node.fullPath}`),
    );
    task.detail = node.description ?? node.commands.join(" && ");
    task.group = resolveTaskGroup(node);
    task.presentationOptions = { reveal: TaskRevealKind.Always };
    return task;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
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
