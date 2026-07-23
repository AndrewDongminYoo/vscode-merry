import * as assert from "assert";
import * as vscode from "vscode";

import type { CliInfo } from "../cli-detector";
import { MerryScriptService } from "../merry-script-service";
import { MerryTaskProvider } from "../merry-task-provider";

suite("MerryTaskProvider", () => {
  let service: MerryScriptService;
  let provider: MerryTaskProvider;
  let contextChanged: vscode.EventEmitter<void>;
  let workspaceRoot: string;
  let cliInfo: CliInfo;
  let refreshCount: number;

  suiteSetup(async () => {
    await new Promise<void>((resolve) => setTimeout(resolve, 500));
  });

  setup(async () => {
    const folder = vscode.workspace.workspaceFolders?.[0];
    assert.ok(folder);
    workspaceRoot = folder.uri.fsPath;
    service = new MerryScriptService(workspaceRoot);
    await service.load();
    contextChanged = new vscode.EventEmitter<void>();
    refreshCount = 0;
    const pubCache = "/external volume/pub-cache";
    cliInfo = {
      cli: "merry",
      launcherPath: `${pubCache}/bin/merry`,
      toolchain: {
        kind: "resolved",
        dartExecutable: "/flutter/bin/cache/dart-sdk/bin/dart",
        flutterRoot: "/flutter",
        pubCache,
        environment: {
          PATH: `/flutter/bin:${pubCache}/bin`,
          PUB_CACHE: pubCache,
        },
        sources: { dart: "fvm", pubCache: "merry-setting" },
        fingerprint: "task-fixture",
      },
    };
    provider = new MerryTaskProvider(
      service,
      workspaceRoot,
      () => cliInfo,
      async () => {
        refreshCount += 1;
      },
      contextChanged.event,
    );
  });

  teardown(() => {
    provider.dispose();
    service.dispose();
    contextChanged.dispose();
  });

  test("provideTasks() returns only leaf nodes (no group nodes)", async () => {
    const taskList = await provider.provideTasks();
    assert.ok(taskList.length > 0, "should produce tasks");
    // 'build' is a group in test-workspace — must not appear as a task
    const buildGroup = taskList.find((t) => t.name === "build");
    assert.strictEqual(
      buildGroup,
      undefined,
      "'build' group must not be a task",
    );
  });

  test("re-resolves the CLI context before serving tasks", async () => {
    await provider.provideTasks();
    await provider.provideTasks();
    assert.strictEqual(refreshCount, 2);
  });

  test("each task name equals node fullPath", async () => {
    const taskList = await provider.provideTasks();
    // 'build aab' is a nested leaf
    const aab = taskList.find((t) => t.name === "build aab");
    assert.ok(aab, "'build aab' task should exist");
  });

  test("shell execution uses resolved launcher, strong quoting, cwd, and env", async () => {
    const taskList = await provider.provideTasks();
    const aab = taskList.find((t) => t.name === "build aab");
    assert.ok(aab);
    const exec = aab.execution as vscode.ShellExecution;
    assert.ok(exec instanceof vscode.ShellExecution);
    assert.deepStrictEqual(exec.command, {
      value: cliInfo.launcherPath,
      quoting: vscode.ShellQuoting.Strong,
    });
    assert.deepStrictEqual(exec.args, [
      "run",
      {
        value: "build",
        quoting: vscode.ShellQuoting.Strong,
      },
      {
        value: "aab",
        quoting: vscode.ShellQuoting.Strong,
      },
    ]);
    assert.strictEqual(exec.options?.cwd, workspaceRoot);
    assert.strictEqual(
      exec.options?.env?.["PUB_CACHE"],
      cliInfo.toolchain.pubCache,
    );
  });

  test("task source is 'merry'", async () => {
    const taskList = await provider.provideTasks();
    for (const t of taskList) {
      assert.strictEqual(t.source, "merry");
    }
  });

  test("'test' task has TaskGroup.Test", async () => {
    const taskList = await provider.provideTasks();
    const testTask = taskList.find((t) => t.name === "test");
    assert.ok(testTask, "'test' task should exist");
    assert.deepStrictEqual(testTask.group, vscode.TaskGroup.Test);
  });

  test("'build aab' task has TaskGroup.Build", async () => {
    const taskList = await provider.provideTasks();
    const aab = taskList.find((t) => t.name === "build aab");
    assert.ok(aab);
    assert.deepStrictEqual(aab.group, vscode.TaskGroup.Build);
  });

  test("cachedTasks is invalidated when onDidChangeScripts fires", async () => {
    const first = await provider.provideTasks();
    service.refresh();
    await new Promise<void>((resolve) => setTimeout(resolve, 200));
    const second = await provider.provideTasks();
    // After refresh, a new array is built — not the same reference
    assert.notStrictEqual(first, second);
  });

  test("cachedTasks is invalidated when execution context changes", async () => {
    const first = await provider.provideTasks();
    contextChanged.fire();
    const second = await provider.provideTasks();
    assert.notStrictEqual(first, second);
  });

  test("returns no tasks when no CLI context is available", async () => {
    provider.dispose();
    provider = new MerryTaskProvider(
      service,
      workspaceRoot,
      () => null,
      async () => {},
      contextChanged.event,
    );
    assert.deepStrictEqual(await provider.provideTasks(), []);
  });

  test("resolveTask returns undefined", async () => {
    const taskList = await provider.provideTasks();
    const result = provider.resolveTask(taskList[0]);
    assert.strictEqual(result, undefined);
  });
});
