# MerryTaskProvider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose merry scripts as VS Code tasks so users can run any script from `Tasks: Run Task` without touching tasks.json, by extracting a shared `MerryScriptService` that both the TreeView provider and the new task provider consume.

**Architecture:** A new `MerryScriptService` takes over parsing, FileSystemWatcher management, and state from `MerryScriptsProvider`. Both `MerryScriptsProvider` (TreeDataProvider) and `MerryTaskProvider` (TaskProvider) subscribe to `service.onDidChangeScripts` and delegate data reads to the service. Dependency direction is always Provider → Service; the two providers are unaware of each other.

**Tech Stack:** TypeScript, VS Code Extension API (`vscode.tasks`, `vscode.TaskProvider`, `vscode.Task`, `vscode.ShellExecution`, `vscode.TaskGroup`), Mocha + assert (existing test harness).

---

## File Map

| Action     | Path                                    | Responsibility                                                       |
| ---------- | --------------------------------------- | -------------------------------------------------------------------- |
| **Create** | `src/merry-script-service.ts`           | Parsing, FileSystemWatcher, state, `onDidChangeScripts` event        |
| **Create** | `src/merry-task-provider.ts`            | `vscode.TaskProvider` — converts leaf `ScriptNode`s to `vscode.Task` |
| **Create** | `src/test/merry-script-service.test.ts` | Unit tests for service public API                                    |
| **Create** | `src/test/merry-task-provider.test.ts`  | Unit tests for task generation logic                                 |
| **Modify** | `src/merry-scripts-provider.ts`         | Remove parsing/watching logic; delegate to `MerryScriptService`      |
| **Modify** | `src/test/integration.test.ts`          | Update `makeProvider()` to construct service first                   |
| **Modify** | `src/extension.ts`                      | Create service, wire both providers, register task provider          |
| **Modify** | `package.json`                          | Add `contributes.taskDefinitions` for type `"merry"`                 |

---

## Task 1: Create `MerryScriptService`

Extract all parsing, file-watching, and state management from `MerryScriptsProvider` into a new service class.

**Files:**

- Create: `src/merry-script-service.ts`
- Create: `src/test/merry-script-service.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/test/merry-script-service.test.ts
import * as assert from "assert";
import * as vscode from "vscode";
import { MerryScriptService } from "../merry-script-service";

suite("MerryScriptService", () => {
  let service: MerryScriptService;

  suiteSetup(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
  });

  setup(async () => {
    const root = vscode.workspace.workspaceFolders![0].uri.fsPath;
    service = new MerryScriptService(root);
    await service.load();
  });

  teardown(() => {
    service.dispose();
  });

  test("getNodes() returns leaf and group nodes from test-workspace", () => {
    const nodes = service.getNodes();
    assert.ok(nodes.length > 0, "should have nodes");
    const test = nodes.find((n) => n.label === "test");
    assert.ok(test, "'test' node should exist");
    assert.strictEqual(test!.isGroup, false);
  });

  test("getScriptsFilePath() ends with merry.yaml", () => {
    const filePath = service.getScriptsFilePath();
    assert.ok(filePath, "scriptsFilePath should not be null");
    assert.ok(filePath!.endsWith("merry.yaml"));
  });

  test("getStatusMessage() is empty when scripts are found", () => {
    assert.strictEqual(service.getStatusMessage(), "");
  });

  test("onDidChangeScripts fires when refresh() is called", async () => {
    let fired = false;
    const disposable = service.onDidChangeScripts(() => {
      fired = true;
    });
    service.refresh();
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    disposable.dispose();
    assert.ok(fired, "onDidChangeScripts should fire after refresh()");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
pnpm run compile-tests 2>&1 | grep "merry-script-service"
```

Expected: `error TS2307: Cannot find module '../merry-script-service'`

- [ ] **Step 3: Create `src/merry-script-service.ts`**

```typescript
import * as fs from "fs";
import * as path from "path";
import {
  type Disposable,
  type Event,
  EventEmitter,
  type FileSystemWatcher,
  RelativePattern,
  workspace,
} from "vscode";

import { parseMerryScripts, type ScriptNode } from "./merry-parser";

const SCRIPT_FILE_CANDIDATES = ["merry.yaml", "derry.yaml"];

export class MerryScriptService implements Disposable {
  private readonly _onDidChangeScripts = new EventEmitter<void>();
  readonly onDidChangeScripts: Event<void> = this._onDidChangeScripts.event;

  private nodes: ScriptNode[] = [];
  private scriptsFilePath: string | null = null;
  private statusMessage: string = "";
  private unlinkedScriptFile: string | null = null;

  private readonly pubspecWatcher: FileSystemWatcher;
  private externalFileWatcher: FileSystemWatcher | null = null;
  private externalListenerDisposables: Disposable[] = [];
  private readonly disposables: Disposable[] = [];

  constructor(private readonly workspaceRoot: string) {
    this.pubspecWatcher = workspace.createFileSystemWatcher(
      new RelativePattern(workspaceRoot, "pubspec.yaml"),
    );
    const onPubspecChange = () => void this.reload();
    this.pubspecWatcher.onDidChange(onPubspecChange, this, this.disposables);
    this.pubspecWatcher.onDidCreate(onPubspecChange, this, this.disposables);
    this.pubspecWatcher.onDidDelete(onPubspecChange, this, this.disposables);
    this.disposables.push(this.pubspecWatcher);
  }

  async load(): Promise<void> {
    await this.reload();
  }

  refresh(): void {
    void this.reload();
  }

  private async reload(): Promise<void> {
    if (this.externalFileWatcher) {
      this.externalFileWatcher.dispose();
      this.externalFileWatcher = null;
    }
    for (const d of this.externalListenerDisposables) d.dispose();
    this.externalListenerDisposables = [];

    const pubspecPath = path.join(this.workspaceRoot, "pubspec.yaml");
    const result = await parseMerryScripts(pubspecPath);

    if (!result) {
      this.nodes = [];
      this.scriptsFilePath = null;
      this.unlinkedScriptFile = this.detectUnlinkedScriptFile();
      this.statusMessage = this.unlinkedScriptFile
        ? ""
        : "No merry scripts found. Add a `scripts:` field to pubspec.yaml.";
    } else {
      this.nodes = result.nodes;
      this.scriptsFilePath = result.scriptsFilePath;
      this.unlinkedScriptFile = null;
      this.statusMessage = "";

      if (result.scriptsFilePath !== pubspecPath) {
        const dir = path.dirname(result.scriptsFilePath);
        const base = path.basename(result.scriptsFilePath);
        this.externalFileWatcher = workspace.createFileSystemWatcher(
          new RelativePattern(dir, base),
        );
        const onExternalChange = () => void this.reload();
        this.externalFileWatcher.onDidChange(
          onExternalChange,
          this,
          this.externalListenerDisposables,
        );
        this.externalFileWatcher.onDidCreate(
          onExternalChange,
          this,
          this.externalListenerDisposables,
        );
        this.externalFileWatcher.onDidDelete(
          onExternalChange,
          this,
          this.externalListenerDisposables,
        );
      }
    }

    this._onDidChangeScripts.fire();
  }

  private detectUnlinkedScriptFile(): string | null {
    for (const candidate of SCRIPT_FILE_CANDIDATES) {
      const filePath = path.join(this.workspaceRoot, candidate);
      if (fs.existsSync(filePath)) return candidate;
    }
    return null;
  }

  getNodes(): ScriptNode[] {
    return this.nodes;
  }

  getScriptsFilePath(): string | null {
    return this.scriptsFilePath;
  }

  getStatusMessage(): string {
    return this.statusMessage;
  }

  getUnlinkedScriptFile(): string | null {
    return this.unlinkedScriptFile;
  }

  dispose(): void {
    this._onDidChangeScripts.dispose();
    for (const d of this.disposables) d.dispose();
    for (const d of this.externalListenerDisposables) d.dispose();
    this.externalFileWatcher?.dispose();
  }
}
```

- [ ] **Step 4: Run compile-tests to verify no errors**

```bash
pnpm run compile-tests 2>&1
```

Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/merry-script-service.ts src/test/merry-script-service.test.ts
git commit -m "feat: extract MerryScriptService as shared service layer"
```

---

## Task 2: Refactor `MerryScriptsProvider` to consume `MerryScriptService`

Slim `MerryScriptsProvider` down to a pure `TreeDataProvider`. All parsing, watching, and state moves to the service.

**Files:**

- Modify: `src/merry-scripts-provider.ts`
- Modify: `src/test/integration.test.ts`

- [ ] **Step 1: Update `makeProvider()` in integration test**

In `src/test/integration.test.ts`, change the import and `makeProvider` helper:

```typescript
// Add import at top (alongside existing imports):
import { MerryScriptService } from "../merry-script-service";

// Replace makeProvider():
async function makeProvider(): Promise<{
  service: MerryScriptService;
  provider: MerryScriptsProvider;
}> {
  const root = vscode.workspace.workspaceFolders![0].uri.fsPath;
  const service = new MerryScriptService(root);
  await service.load();
  const provider = new MerryScriptsProvider(service);
  return { service, provider };
}
```

Then update every call site. Each test that calls `makeProvider()` currently does:

```typescript
// Before:
const provider = await makeProvider();

// After:
const { service, provider } = await makeProvider();
```

Add `service.dispose()` (and `provider.dispose()` if already present) in teardown where applicable, or at the end of each test that calls `makeProvider()`.

- [ ] **Step 2: Rewrite `src/merry-scripts-provider.ts`**

Replace the entire file content:

```typescript
import {
  type Disposable,
  EventEmitter,
  type TreeDataProvider,
  type TreeItem,
} from "vscode";

import type { ScriptNode } from "./merry-parser";
import type { MerryScriptService } from "./merry-script-service";
import { ScriptItem } from "./script-item";

export class MerryScriptsProvider
  implements TreeDataProvider<ScriptItem>, Disposable
{
  private readonly _onDidChangeTreeData = new EventEmitter<
    ScriptItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly disposables: Disposable[] = [];

  constructor(private readonly service: MerryScriptService) {
    service.onDidChangeScripts(
      () => this._onDidChangeTreeData.fire(),
      this,
      this.disposables,
    );
  }

  getTreeItem(element: ScriptItem): TreeItem {
    return element;
  }

  getChildren(element?: ScriptItem): ScriptItem[] {
    if (!element) {
      return this.service.getNodes().map((n) => new ScriptItem(n));
    }
    if (element.node.isGroup) {
      return element.node.children.map((n) => new ScriptItem(n));
    }
    return [];
  }

  getScriptsFilePath(): string | null {
    return this.service.getScriptsFilePath();
  }

  getNodes(): ScriptNode[] {
    return this.service.getNodes();
  }

  getStatusMessage(): string {
    return this.service.getStatusMessage();
  }

  getUnlinkedScriptFile(): string | null {
    return this.service.getUnlinkedScriptFile();
  }

  refresh(): void {
    this.service.refresh();
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
```

- [ ] **Step 3: Run compile-tests**

```bash
pnpm run compile-tests 2>&1
```

Expected: no errors.

- [ ] **Step 4: Run lint**

```bash
pnpm run lint 2>&1
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/merry-scripts-provider.ts src/test/integration.test.ts
git commit -m "refactor: slim MerryScriptsProvider to delegate state to MerryScriptService"
```

---

## Task 3: Create `MerryTaskProvider`

Implement the task provider that converts leaf `ScriptNode`s into VS Code tasks.

**Files:**

- Create: `src/merry-task-provider.ts`
- Create: `src/test/merry-task-provider.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// src/test/merry-task-provider.test.ts
import * as assert from "assert";
import * as vscode from "vscode";

import { MerryScriptService } from "../merry-script-service";
import { MerryTaskProvider } from "../merry-task-provider";

suite("MerryTaskProvider", () => {
  let service: MerryScriptService;
  let provider: MerryTaskProvider;

  suiteSetup(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
  });

  setup(async () => {
    const root = vscode.workspace.workspaceFolders![0].uri.fsPath;
    service = new MerryScriptService(root);
    await service.load();
    provider = new MerryTaskProvider(service, () => "merry");
  });

  teardown(() => {
    provider.dispose();
    service.dispose();
  });

  test("provideTasks() returns only leaf nodes (no group nodes)", () => {
    const taskList = provider.provideTasks();
    assert.ok(taskList.length > 0, "should produce tasks");
    // 'build' is a group in test-workspace — must not appear as a task
    const buildGroup = taskList.find((t) => t.name === "build");
    assert.strictEqual(
      buildGroup,
      undefined,
      "'build' group must not be a task",
    );
  });

  test("each task name equals node fullPath", () => {
    const taskList = provider.provideTasks();
    // 'build aab' is a nested leaf
    const aab = taskList.find((t) => t.name === "build aab");
    assert.ok(aab, "'build aab' task should exist");
  });

  test("shell execution uses correct cli and fullPath", () => {
    const taskList = provider.provideTasks();
    const aab = taskList.find((t) => t.name === "build aab")!;
    const exec = aab.execution as vscode.ShellExecution;
    assert.ok(exec instanceof vscode.ShellExecution);
    assert.ok(
      (exec.commandLine ?? "").includes("merry run build aab"),
      `command should contain 'merry run build aab', got: ${exec.commandLine}`,
    );
  });

  test("task source is 'merry'", () => {
    const taskList = provider.provideTasks();
    for (const t of taskList) {
      assert.strictEqual(t.source, "merry");
    }
  });

  test("'test' task has TaskGroup.Test", () => {
    const taskList = provider.provideTasks();
    const testTask = taskList.find((t) => t.name === "test");
    assert.ok(testTask, "'test' task should exist");
    assert.deepStrictEqual(testTask!.group, vscode.TaskGroup.Test);
  });

  test("'build aab' task has TaskGroup.Build", () => {
    const taskList = provider.provideTasks();
    const aab = taskList.find((t) => t.name === "build aab")!;
    assert.deepStrictEqual(aab.group, vscode.TaskGroup.Build);
  });

  test("cachedTasks is invalidated when onDidChangeScripts fires", async () => {
    const first = provider.provideTasks();
    service.refresh();
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    const second = provider.provideTasks();
    // After refresh, a new array is built — not the same reference
    assert.notStrictEqual(first, second);
  });

  test("resolveTask returns undefined", () => {
    const taskList = provider.provideTasks();
    const result = provider.resolveTask(taskList[0]);
    assert.strictEqual(result, undefined);
  });
});
```

- [ ] **Step 2: Run compile-tests to confirm the import fails**

```bash
pnpm run compile-tests 2>&1 | grep "merry-task-provider"
```

Expected: `error TS2307: Cannot find module '../merry-task-provider'`

- [ ] **Step 3: Create `src/merry-task-provider.ts`**

```typescript
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
```

- [ ] **Step 4: Run compile-tests**

```bash
pnpm run compile-tests 2>&1
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/merry-task-provider.ts src/test/merry-task-provider.test.ts
git commit -m "feat: add MerryTaskProvider to expose merry scripts as VS Code tasks"
```

---

## Task 4: Wire up service and task provider in `extension.ts` and `package.json`

**Files:**

- Modify: `src/extension.ts`
- Modify: `package.json`

- [ ] **Step 1: Add `taskDefinitions` to `package.json` `contributes`**

In `package.json`, inside `"contributes": { ... }`, add after the `"configuration"` block:

```json
"taskDefinitions": [
  {
    "type": "merry",
    "required": [],
    "properties": {
      "script": {
        "type": "string",
        "description": "The merry script path to run (e.g. 'build aab')"
      }
    }
  }
]
```

- [ ] **Step 2: Update imports in `extension.ts`**

Replace the existing import block at the top of `src/extension.ts`:

```typescript
import * as path from "path";
import {
  commands,
  env,
  type ExtensionContext,
  languages,
  StatusBarAlignment,
  type StatusBarItem,
  tasks,
  type Terminal,
  Uri,
  window,
  workspace,
} from "vscode";

import { type CliInfo, detectMerryCli, type MerryCli } from "./cli-detector";
import { Commands } from "./commands";
import { MerryCodeLensProvider } from "./merry-codelens-provider";
import { MerryScriptService } from "./merry-script-service";
import { MerryScriptsProvider } from "./merry-scripts-provider";
import { MerryTaskProvider } from "./merry-task-provider";
import type { ScriptItem } from "./script-item";
```

- [ ] **Step 3: Replace provider construction in `activate()`**

In `src/extension.ts`, replace the section:

```typescript
// Before (around line 46-47):
const provider = new MerryScriptsProvider(workspaceRoot);
await provider.load();
```

With:

```typescript
// 1. Create shared service — owns parsing, file-watching, state.
const service = new MerryScriptService(workspaceRoot);
await service.load();

// 2. Create providers that consume the service.
const provider = new MerryScriptsProvider(service);
const taskProvider = new MerryTaskProvider(service, () => activeCli ?? "merry");
```

- [ ] **Step 4: Register the task provider in `context.subscriptions`**

In the `context.subscriptions.push(...)` block (around line 92), add:

```typescript
service,
tasks.registerTaskProvider(MerryTaskProvider.taskType, taskProvider),
taskProvider,
```

The full subscriptions block should look like:

```typescript
context.subscriptions.push(
  service,
  tasks.registerTaskProvider(MerryTaskProvider.taskType, taskProvider),
  taskProvider,
  treeView,
  provider,
  provider.onDidChangeTreeData(updateTreeMessage),
  provider.onDidChangeTreeData(checkUnlinkedScriptFile),
  languages.registerCodeLensProvider(docSelector, codeLensProvider),

  window.onDidCloseTerminal((closed) => {
    if (terminal === closed) {
      terminal = null;
      terminalBusy = false;
    }
  }),

  window.onDidStartTerminalShellExecution((e) => {
    if (e.terminal === terminal) {
      terminalBusy = true;
    }
  }),
  window.onDidEndTerminalShellExecution((e) => {
    if (e.terminal === terminal) {
      terminalBusy = false;
    }
  }),
);
```

- [ ] **Step 5: Run full compile**

```bash
pnpm run compile 2>&1
```

Expected: type-check passes, lint passes, esbuild succeeds.

- [ ] **Step 6: Run all tests**

```bash
pnpm run compile-tests 2>&1 && echo "compile OK"
```

Expected: no TypeScript errors.

- [ ] **Step 7: Verify task provider is registered**

Manually open the test-workspace in VS Code Extension Development Host (`F5`), then open the Command Palette and run `Tasks: Run Task`. Confirm a **"merry"** section appears with entries like `development`, `test`, `build aab`, `build ipa`, `build apk`, `firebase config dev`, etc.

- [ ] **Step 8: Commit**

```bash
git add src/extension.ts package.json
git commit -m "feat: wire MerryScriptService and MerryTaskProvider into extension activation"
```

---

## Verification Checklist

- [ ] `pnpm run compile` passes (type-check + lint + esbuild)
- [ ] `pnpm run compile-tests` passes
- [ ] `Tasks: Run Task` in the Extension Development Host shows a **"merry"** section
- [ ] Group nodes (`build`, `firebase`) do **not** appear as tasks
- [ ] Leaf scripts (`build aab`, `firebase config dev`, `test`, etc.) **do** appear
- [ ] `Terminal > Run Build Task` (Ctrl+Shift+B) shows `build aab`, `build ipa`, `build apk`
- [ ] `Terminal > Run Test Task` (Ctrl+Shift+T) shows `test`, `pretest`, `posttest`
- [ ] Refreshing merry.yaml (adding a script) causes the task list to update
