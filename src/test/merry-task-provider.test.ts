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
