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
