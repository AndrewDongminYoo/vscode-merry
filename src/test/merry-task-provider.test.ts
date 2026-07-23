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
      contextChanged.event,
    );
  });

  teardown(() => {
    provider.dispose();
    service.dispose();
    contextChanged.dispose();
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

  test("shell execution uses resolved launcher, strong quoting, cwd, and env", () => {
    const taskList = provider.provideTasks();
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
        value: "build aab",
        quoting: vscode.ShellQuoting.Strong,
      },
    ]);
    assert.strictEqual(exec.options?.cwd, workspaceRoot);
    assert.strictEqual(
      exec.options?.env?.["PUB_CACHE"],
      cliInfo.toolchain.pubCache,
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
    assert.deepStrictEqual(testTask.group, vscode.TaskGroup.Test);
  });

  test("'build aab' task has TaskGroup.Build", () => {
    const taskList = provider.provideTasks();
    const aab = taskList.find((t) => t.name === "build aab");
    assert.ok(aab);
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

  test("cachedTasks is invalidated when execution context changes", () => {
    const first = provider.provideTasks();
    contextChanged.fire();
    const second = provider.provideTasks();
    assert.notStrictEqual(first, second);
  });

  test("returns no tasks when no CLI context is available", () => {
    provider.dispose();
    provider = new MerryTaskProvider(
      service,
      workspaceRoot,
      () => null,
      contextChanged.event,
    );
    assert.deepStrictEqual(provider.provideTasks(), []);
  });

  test("resolveTask returns undefined", () => {
    const taskList = provider.provideTasks();
    const result = provider.resolveTask(taskList[0]);
    assert.strictEqual(result, undefined);
  });
});
