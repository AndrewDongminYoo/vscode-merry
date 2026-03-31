import * as assert from "assert";
import * as vscode from "vscode";
import { MerryScriptsProvider } from "../merry-scripts-provider";
import { ScriptItem } from "../script-item";

// ── Helpers ───────────────────────────────────────────────────────────────

/**
 * Wait until a command is registered (polls every 100 ms, up to maxWaitMs).
 * The extension activates on `workspaceContains:pubspec.yaml`, which is
 * asynchronous — commands are not available until activation finishes.
 */
async function waitForCommand(
  command: string,
  maxWaitMs = 5000,
): Promise<void> {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    const cmds = await vscode.commands.getCommands(false);
    if (cmds.includes(command)) {
      return;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(
    `Command '${command}' was not registered within ${maxWaitMs} ms`,
  );
}

/**
 * Wait for the provider to emit its first `onDidChangeTreeData` event,
 * which fires after the initial async `reload()` finishes.
 */
function waitForLoad(provider: MerryScriptsProvider): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Timeout: tree data did not load within 3 s")),
      3000,
    );
    const sub = provider.onDidChangeTreeData!(() => {
      clearTimeout(timer);
      sub.dispose();
      resolve();
    });
  });
}

/** Create a provider pointing at the currently open workspace and wait for load. */
async function makeProvider(): Promise<MerryScriptsProvider> {
  const root = vscode.workspace.workspaceFolders![0].uri.fsPath;
  const provider = new MerryScriptsProvider(root);
  await waitForLoad(provider);
  return provider;
}

// ── Suite ─────────────────────────────────────────────────────────────────

suite("Integration: Merry Scripts View", () => {
  suiteSetup(async () => {
    // Ensure the extension has finished activating before any test runs.
    // The extension registers vscode-merry.runScript during activate().
    await waitForCommand("vscode-merry.runScript");
  });

  // ── Extension activation ───────────────────────────────────────────────

  test("extension registers all expected commands", async () => {
    const cmds = await vscode.commands.getCommands(false);
    assert.ok(cmds.includes("vscode-merry.runScript"), "runScript command");
    assert.ok(cmds.includes("vscode-merry.refresh"), "refresh command");
    assert.ok(cmds.includes("vscode-merry.installCli"), "installCli command");
    assert.ok(
      cmds.includes("vscode-merry.openScriptSource"),
      "openScriptSource command",
    );
  });

  // ── Tree data: top-level nodes ─────────────────────────────────────────

  test("provider returns top-level scripts from test-workspace merry.yaml", async () => {
    const provider = await makeProvider();
    try {
      const items = provider.getChildren();
      const labels = items.map((i: ScriptItem) => i.node.label);

      // Scripts declared in test-workspace/merry.yaml
      for (const expected of [
        "test",
        "analyze",
        "format",
        "clean",
        "gen",
        "publish",
        "build",
        "run",
        "upgrade",
      ]) {
        assert.ok(
          labels.includes(expected),
          `Expected '${expected}' in top-level nodes. Got: [${labels.join(", ")}]`,
        );
      }
    } finally {
      provider.dispose();
    }
  });

  test("scriptsFilePath resolves to merry.yaml, not pubspec.yaml", async () => {
    const provider = await makeProvider();
    try {
      const filePath = provider.getScriptsFilePath();
      assert.ok(filePath, "Expected a non-null scripts file path");
      assert.ok(
        filePath.endsWith("merry.yaml"),
        `Expected path ending in merry.yaml, got: ${filePath}`,
      );
    } finally {
      provider.dispose();
    }
  });

  // ── Tree data: leaf nodes ──────────────────────────────────────────────

  test("'test' script has correct command and is not a hook", async () => {
    const provider = await makeProvider();
    try {
      const items = provider.getChildren();
      const testItem = items.find((i: ScriptItem) => i.node.label === "test");
      assert.ok(testItem, "Expected 'test' node");
      assert.deepStrictEqual(testItem.node.commands, ["flutter test"]);
      assert.strictEqual(testItem.node.isGroup, false);
      assert.strictEqual(testItem.node.isHook, false);
    } finally {
      provider.dispose();
    }
  });

  test("'gen' has description and single command", async () => {
    const provider = await makeProvider();
    try {
      const items = provider.getChildren();
      const genItem = items.find((i: ScriptItem) => i.node.label === "gen");
      assert.ok(genItem, "Expected 'gen' node");
      assert.strictEqual(
        genItem.node.description,
        "Run build_runner code generation",
      );
      assert.deepStrictEqual(genItem.node.commands, [
        "dart run build_runner build --delete-conflicting-outputs",
      ]);
    } finally {
      provider.dispose();
    }
  });

  // ── Tree data: hooks ───────────────────────────────────────────────────

  test("pretest is marked as a hook with arrow-right icon", async () => {
    const provider = await makeProvider();
    try {
      const items = provider.getChildren();
      const pretest = items.find((i: ScriptItem) => i.node.label === "pretest");
      assert.ok(pretest, "Expected 'pretest' node");
      assert.strictEqual(pretest.node.isHook, true);
      assert.ok(pretest.iconPath instanceof vscode.ThemeIcon);
      assert.strictEqual(
        (pretest.iconPath as vscode.ThemeIcon).id,
        "arrow-right",
      );
    } finally {
      provider.dispose();
    }
  });

  test("posttest is marked as a hook", async () => {
    const provider = await makeProvider();
    try {
      const items = provider.getChildren();
      const posttest = items.find(
        (i: ScriptItem) => i.node.label === "posttest",
      );
      assert.ok(posttest, "Expected 'posttest' node");
      assert.strictEqual(posttest.node.isHook, true);
    } finally {
      provider.dispose();
    }
  });

  // ── Tree data: nested groups ───────────────────────────────────────────

  test("'build' is a collapsible group node", async () => {
    const provider = await makeProvider();
    try {
      const items = provider.getChildren();
      const buildItem = items.find((i: ScriptItem) => i.node.label === "build");
      assert.ok(buildItem, "Expected 'build' group");
      assert.strictEqual(buildItem.node.isGroup, true);
      assert.strictEqual(
        buildItem.collapsibleState,
        vscode.TreeItemCollapsibleState.Collapsed,
      );
    } finally {
      provider.dispose();
    }
  });

  test("'build' group contains android, ios, web children", async () => {
    const provider = await makeProvider();
    try {
      const items = provider.getChildren();
      const buildItem = items.find((i: ScriptItem) => i.node.label === "build");
      assert.ok(buildItem);

      const children = provider.getChildren(buildItem);
      const childLabels = children.map((c: ScriptItem) => c.node.label);
      assert.ok(
        childLabels.includes("android"),
        `Expected 'android', got: [${childLabels.join(", ")}]`,
      );
      assert.ok(childLabels.includes("ios"));
      assert.ok(childLabels.includes("web"));
    } finally {
      provider.dispose();
    }
  });

  test("children of 'build' have correct fullPath prefix", async () => {
    const provider = await makeProvider();
    try {
      const items = provider.getChildren();
      const buildItem = items.find((i: ScriptItem) => i.node.label === "build");
      assert.ok(buildItem);

      const children = provider.getChildren(buildItem);
      for (const child of children) {
        assert.ok(
          child.node.fullPath.startsWith("build "),
          `Expected fullPath to start with 'build ', got: ${child.node.fullPath}`,
        );
      }
    } finally {
      provider.dispose();
    }
  });

  // ── Refresh ────────────────────────────────────────────────────────────

  test("refresh triggers onDidChangeTreeData", async () => {
    const provider = await makeProvider();
    try {
      // Call provider.refresh() directly — the vscode-merry.refresh command
      // targets the extension's own registered provider (a different instance).
      const fired = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), 2000);
        const sub = provider.onDidChangeTreeData!(() => {
          clearTimeout(timer);
          sub.dispose();
          resolve(true);
        });
        provider.refresh();
      });
      assert.strictEqual(
        fired,
        true,
        "Expected onDidChangeTreeData to fire after refresh",
      );
    } finally {
      provider.dispose();
    }
  });
});
