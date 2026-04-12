import * as assert from "assert";
import type { TextDocument } from "vscode";

import { MerryCodeLensProvider } from "../merry-codelens-provider";
import type { ScriptNode } from "../merry-parser";
import type { MerryScriptsProvider } from "../merry-scripts-provider";

// ── Stubs ─────────────────────────────────────────────────────────────────────

const FAKE_PATH = "/fake/scripts.yaml";

/**
 * Minimal stub implementing the three members MerryCodeLensProvider
 * actually calls on its provider dependency.
 */
function makeStubProvider(
  nodes: ScriptNode[],
  filePath = FAKE_PATH,
): MerryScriptsProvider {
  return {
    getScriptsFilePath: () => filePath,
    getNodes: () => nodes,
    onDidChangeTreeData: () => ({ dispose: () => {} }),
  } as unknown as MerryScriptsProvider;
}

/**
 * Minimal stub satisfying the two TextDocument properties read in
 * provideCodeLenses: getText() and uri.fsPath.
 */
function makeStubDocument(content: string, fsPath = FAKE_PATH): TextDocument {
  return {
    getText: () => content,
    uri: { fsPath },
  } as unknown as TextDocument;
}

// ── Node builders ─────────────────────────────────────────────────────────────

function leaf(
  label: string,
  fullPath: string,
  extra?: Partial<ScriptNode>,
): ScriptNode {
  return {
    label,
    fullPath,
    commands: ["echo ok"],
    isGroup: false,
    children: [],
    isHook: false,
    ...extra,
  };
}

function group(
  label: string,
  fullPath: string,
  children: ScriptNode[],
): ScriptNode {
  return {
    label,
    fullPath,
    commands: [],
    isGroup: true,
    children,
    isHook: false,
  };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

suite("MerryCodeLensProvider", () => {
  // ── Guard conditions ────────────────────────────────────────────────────────

  test("returns empty array when document fsPath does not match scripts file", () => {
    const codeLens = new MerryCodeLensProvider(
      makeStubProvider([leaf("test", "test")], "/path/a.yaml"),
    );
    const lenses = codeLens.provideCodeLenses(
      makeStubDocument("test: flutter test", "/path/b.yaml"),
    );
    assert.deepStrictEqual(lenses, []);
  });

  test("returns empty array when provider has no nodes", () => {
    const codeLens = new MerryCodeLensProvider(makeStubProvider([]));
    assert.deepStrictEqual(
      codeLens.provideCodeLenses(makeStubDocument("")),
      [],
    );
  });

  // ── Basic lens placement ────────────────────────────────────────────────────

  test("provides a CodeLens for each top-level leaf at the correct line", () => {
    const yaml = [
      "build:", // line 0
      "  (scripts): flutter build", // line 1
      "test:", // line 2
      "  (scripts): flutter test", // line 3
    ].join("\n");

    const codeLens = new MerryCodeLensProvider(
      makeStubProvider([leaf("build", "build"), leaf("test", "test")]),
    );
    const lenses = codeLens.provideCodeLenses(makeStubDocument(yaml));

    assert.strictEqual(lenses.length, 2);

    const buildLens = lenses.find(
      (l) => l.command?.arguments?.[0]?.node?.fullPath === "build",
    );
    const testLens = lenses.find(
      (l) => l.command?.arguments?.[0]?.node?.fullPath === "test",
    );

    assert.ok(buildLens, "Expected CodeLens for 'build'");
    assert.ok(testLens, "Expected CodeLens for 'test'");
    assert.strictEqual(buildLens!.range.start.line, 0, "'build:' is on line 0");
    assert.strictEqual(testLens!.range.start.line, 2, "'test:' is on line 2");
  });

  test("provides a CodeLens for a deeply nested leaf at the correct line", () => {
    const yaml = [
      "firebase:", // line 0
      "  config:", // line 1
      "    dev:", // line 2
      "      (scripts): flutterfire configure", // line 3
    ].join("\n");

    const nodes = [
      group("firebase", "firebase", [
        group("config", "firebase config", [
          leaf("dev", "firebase config dev"),
        ]),
      ]),
    ];

    const codeLens = new MerryCodeLensProvider(makeStubProvider(nodes));
    const lenses = codeLens.provideCodeLenses(makeStubDocument(yaml));

    assert.strictEqual(lenses.length, 1);
    assert.strictEqual(lenses[0].range.start.line, 2, "'dev:' is on line 2");
    assert.ok(
      lenses[0].command?.title.includes("firebase config dev"),
      `Title should include 'firebase config dev', got: '${lenses[0].command?.title}'`,
    );
  });

  // ── Regression: same label at different nesting depths ─────────────────────

  test("places CodeLenses at distinct lines when two nodes share the same label", () => {
    // Before the fix: findKeyLine used Array.findIndex (first match only), so
    // both the top-level 'dev' node and the nested 'firebase config dev' node
    // resolved to line 0. VS Code merged them into one line as:
    //   "$(play) Run: dev | $(play) Run: firebase config dev"
    //
    // After the fix: findKeyLine walks path segments sequentially, so each node
    // is anchored to its own line in the file.
    const yaml = [
      "dev:", // line 0  ← top-level dev
      "  (scripts): flutter run", // line 1
      "firebase:", // line 2
      "  config:", // line 3
      "    dev:", // line 4  ← firebase config dev
      "      (scripts): flutterfire", // line 5
    ].join("\n");

    const nodes = [
      leaf("dev", "dev"),
      group("firebase", "firebase", [
        group("config", "firebase config", [
          leaf("dev", "firebase config dev"),
        ]),
      ]),
    ];

    const codeLens = new MerryCodeLensProvider(makeStubProvider(nodes));
    const lenses = codeLens.provideCodeLenses(makeStubDocument(yaml));

    assert.strictEqual(lenses.length, 2, "Expected exactly two CodeLenses");

    const topLens = lenses.find(
      (l) => l.command?.arguments?.[0]?.node?.fullPath === "dev",
    );
    const nestedLens = lenses.find(
      (l) =>
        l.command?.arguments?.[0]?.node?.fullPath === "firebase config dev",
    );

    assert.ok(topLens, "Expected CodeLens for top-level 'dev'");
    assert.ok(nestedLens, "Expected CodeLens for 'firebase config dev'");

    assert.strictEqual(
      topLens!.range.start.line,
      0,
      "Top-level 'dev:' must be on line 0",
    );
    assert.strictEqual(
      nestedLens!.range.start.line,
      4,
      "Nested 'dev:' must be on line 4",
    );

    assert.notStrictEqual(
      topLens!.range.start.line,
      nestedLens!.range.start.line,
      "The two 'dev' nodes must NOT resolve to the same line",
    );
  });

  test("sibling groups with the same leaf label each get the correct line", () => {
    // Two groups (bootstrap, config) each containing a 'dev' leaf.
    // The CodeLens for 'firebase bootstrap dev' must land on line 2,
    // and 'firebase config dev' on line 5 — not both on line 2.
    const yaml = [
      "firebase:", // line 0
      "  bootstrap:", // line 1
      "    dev:", // line 2
      "      (scripts): x", // line 3
      "  config:", // line 4
      "    dev:", // line 5
      "      (scripts): y", // line 6
    ].join("\n");

    const nodes = [
      group("firebase", "firebase", [
        group("bootstrap", "firebase bootstrap", [
          leaf("dev", "firebase bootstrap dev"),
        ]),
        group("config", "firebase config", [
          leaf("dev", "firebase config dev"),
        ]),
      ]),
    ];

    const codeLens = new MerryCodeLensProvider(makeStubProvider(nodes));
    const lenses = codeLens.provideCodeLenses(makeStubDocument(yaml));

    assert.strictEqual(lenses.length, 2);

    const bootstrapDevLens = lenses.find(
      (l) =>
        l.command?.arguments?.[0]?.node?.fullPath === "firebase bootstrap dev",
    );
    const configDevLens = lenses.find(
      (l) =>
        l.command?.arguments?.[0]?.node?.fullPath === "firebase config dev",
    );

    assert.ok(
      bootstrapDevLens,
      "Expected CodeLens for 'firebase bootstrap dev'",
    );
    assert.ok(configDevLens, "Expected CodeLens for 'firebase config dev'");

    assert.strictEqual(bootstrapDevLens!.range.start.line, 2);
    assert.strictEqual(configDevLens!.range.start.line, 5);
  });

  // ── Group nodes ─────────────────────────────────────────────────────────────

  test("does not produce a CodeLens for group nodes, only their leaf children", () => {
    const yaml = [
      "build:", // line 0 (group — no lens)
      "  android:", // line 1
      "    (scripts): apk", // line 2
      "  ios:", // line 3
      "    (scripts): ipa", // line 4
    ].join("\n");

    const nodes = [
      group("build", "build", [
        leaf("android", "build android"),
        leaf("ios", "build ios"),
      ]),
    ];

    const codeLens = new MerryCodeLensProvider(makeStubProvider(nodes));
    const lenses = codeLens.provideCodeLenses(makeStubDocument(yaml));

    const fullPaths = lenses.map(
      (l) => l.command?.arguments?.[0]?.node?.fullPath,
    );
    assert.ok(
      !fullPaths.includes("build"),
      "Group node 'build' must not have a CodeLens",
    );
    assert.ok(
      fullPaths.includes("build android"),
      "Leaf 'build android' must have a CodeLens",
    );
    assert.ok(
      fullPaths.includes("build ios"),
      "Leaf 'build ios' must have a CodeLens",
    );
  });

  // ── Lens title and icon ─────────────────────────────────────────────────────

  test("CodeLens title contains the node fullPath after 'Run: '", () => {
    const yaml = "firebase:\n  config:\n    prod:\n      (scripts): x\n";
    const nodes = [
      group("firebase", "firebase", [
        group("config", "firebase config", [
          leaf("prod", "firebase config prod"),
        ]),
      ]),
    ];
    const codeLens = new MerryCodeLensProvider(makeStubProvider(nodes));
    const [lens] = codeLens.provideCodeLenses(makeStubDocument(yaml));

    assert.ok(lens, "Expected one CodeLens");
    assert.ok(
      lens.command?.title.includes("Run: firebase config prod"),
      `Title should include 'Run: firebase config prod', got: '${lens.command?.title}'`,
    );
  });

  test("hook node uses $(arrow-right) icon in title", () => {
    const yaml = "pretest:\n  (scripts): flutter clean\n";
    const codeLens = new MerryCodeLensProvider(
      makeStubProvider([leaf("pretest", "pretest", { isHook: true })]),
    );
    const [lens] = codeLens.provideCodeLenses(makeStubDocument(yaml));

    assert.ok(lens, "Expected one CodeLens");
    assert.ok(
      lens.command?.title.startsWith("$(arrow-right)"),
      `Expected title to start with '$(arrow-right)', got: '${lens.command?.title}'`,
    );
  });

  test("non-hook node uses $(play) icon in title", () => {
    const yaml = "test:\n  (scripts): flutter test\n";
    const codeLens = new MerryCodeLensProvider(
      makeStubProvider([leaf("test", "test", { isHook: false })]),
    );
    const [lens] = codeLens.provideCodeLenses(makeStubDocument(yaml));

    assert.ok(lens, "Expected one CodeLens");
    assert.ok(
      lens.command?.title.startsWith("$(play)"),
      `Expected title to start with '$(play)', got: '${lens.command?.title}'`,
    );
  });

  test("platform-dispatch node includes ' (platform)' suffix in title", () => {
    const yaml =
      "run:\n  (linux): flutter run -d linux\n  (macos): flutter run -d macos\n";
    const codeLens = new MerryCodeLensProvider(
      makeStubProvider([leaf("run", "run", { isPlatformDispatch: true })]),
    );
    const [lens] = codeLens.provideCodeLenses(makeStubDocument(yaml));

    assert.ok(lens, "Expected one CodeLens");
    assert.ok(
      lens.command?.title.endsWith(" (platform)"),
      `Expected title to end with ' (platform)', got: '${lens.command?.title}'`,
    );
  });

  // ── Missing key in document ─────────────────────────────────────────────────

  test("skips nodes whose key is not found in the document", () => {
    const yaml = "test: flutter test\n";
    const nodes = [leaf("test", "test"), leaf("ghost", "ghost")];
    const codeLens = new MerryCodeLensProvider(makeStubProvider(nodes));
    const lenses = codeLens.provideCodeLenses(makeStubDocument(yaml));

    assert.strictEqual(lenses.length, 1);
    assert.strictEqual(
      lenses[0].command?.arguments?.[0]?.node?.fullPath,
      "test",
    );
  });
});
