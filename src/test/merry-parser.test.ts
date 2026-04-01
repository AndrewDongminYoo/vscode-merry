import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { parseMerryScripts, type ScriptNode } from "../merry-parser";

suite("MerryParser", () => {
  let tmpDir: string;

  setup(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vscode-merry-test-"));
  });

  teardown(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writePubspec(content: string): string {
    const p = path.join(tmpDir, "pubspec.yaml");
    fs.writeFileSync(p, content, "utf8");
    return p;
  }

  function findNode(
    nodes: ScriptNode[],
    label: string,
  ): ScriptNode | undefined {
    for (const n of nodes) {
      if (n.label === label) {
        return n;
      }
      const found = findNode(n.children, label);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  // ── File-level edge cases ──────────────────────────────────────

  test("returns null when pubspec.yaml does not exist", async () => {
    const result = await parseMerryScripts(path.join(tmpDir, "pubspec.yaml"));
    assert.strictEqual(result, null);
  });

  test("returns null when pubspec has no scripts field", async () => {
    const p = writePubspec("name: example\nversion: 1.0.0\n");
    assert.strictEqual(await parseMerryScripts(p), null);
  });

  test("returns null for invalid YAML", async () => {
    const p = writePubspec("name: [\nbroken yaml");
    assert.strictEqual(await parseMerryScripts(p), null);
  });

  // ── Inline scripts ─────────────────────────────────────────────

  test("parses simple string command", async () => {
    const p = writePubspec(`
name: example
scripts:
  test: flutter test
`);
    const result = await parseMerryScripts(p);
    assert.ok(result);
    assert.strictEqual(result.scriptsFilePath, p);
    const node = result.nodes.find((n) => n.label === "test");
    assert.ok(node);
    assert.deepStrictEqual(node.commands, ["flutter test"]);
    assert.strictEqual(node.isGroup, false);
    assert.strictEqual(node.isHook, false);
  });

  test("parses list of commands", async () => {
    const p = writePubspec(`
name: example
scripts:
  clean:
    - flutter clean
    - flutter pub get
`);
    const result = await parseMerryScripts(p);
    assert.ok(result);
    const node = result.nodes.find((n) => n.label === "clean");
    assert.ok(node);
    assert.deepStrictEqual(node.commands, ["flutter clean", "flutter pub get"]);
    assert.strictEqual(node.isGroup, false);
  });

  test("parses Definition map with (scripts) key", async () => {
    const p = writePubspec(`
name: example
scripts:
  gen:
    (description): Generate code
    (scripts): dart run build_runner build
    (workdir): packages/core
`);
    const result = await parseMerryScripts(p);
    assert.ok(result);
    const node = result.nodes.find((n) => n.label === "gen");
    assert.ok(node);
    assert.deepStrictEqual(node.commands, ["dart run build_runner build"]);
    assert.strictEqual(node.description, "Generate code");
    assert.strictEqual(node.workdir, "packages/core");
    assert.strictEqual(node.isGroup, false);
  });

  test("parses Definition with list (scripts)", async () => {
    const p = writePubspec(`
name: example
scripts:
  publish:
    (description): Publish to pub.dev
    (scripts):
      - dart pub publish --dry-run
      - dart pub publish
`);
    const result = await parseMerryScripts(p);
    assert.ok(result);
    const node = result.nodes.find((n) => n.label === "publish");
    assert.ok(node);
    assert.deepStrictEqual(node.commands, [
      "dart pub publish --dry-run",
      "dart pub publish",
    ]);
    assert.strictEqual(node.description, "Publish to pub.dev");
  });

  test("parses nested group as collapsible node", async () => {
    const p = writePubspec(`
name: example
scripts:
  build:
    android: flutter build apk
    ios: flutter build ios
`);
    const result = await parseMerryScripts(p);
    assert.ok(result);
    const group = result.nodes.find((n) => n.label === "build");
    assert.ok(group);
    assert.strictEqual(group.isGroup, true);
    assert.strictEqual(group.children.length, 2);

    const android = group.children.find((c) => c.label === "android");
    assert.ok(android);
    assert.deepStrictEqual(android.commands, ["flutter build apk"]);
    assert.strictEqual(android.fullPath, "build android");

    const ios = group.children.find((c) => c.label === "ios");
    assert.ok(ios);
    assert.strictEqual(ios.fullPath, "build ios");
  });

  test("skips meta-keys at top level", async () => {
    const p = writePubspec(`
name: example
scripts:
  (variables):
    VERSION: 1.0.0
  test: flutter test
`);
    const result = await parseMerryScripts(p);
    assert.ok(result);
    assert.strictEqual(result.nodes.length, 1);
    assert.strictEqual(result.nodes[0].label, "test");
  });

  test("skips meta-keys inside Definition group", async () => {
    const p = writePubspec(`
name: example
scripts:
  build:
    android: flutter build apk
    (aliases):
      - b
`);
    const result = await parseMerryScripts(p);
    assert.ok(result);
    const group = result.nodes.find((n) => n.label === "build");
    assert.ok(group);
    assert.strictEqual(group.isGroup, true);
    assert.strictEqual(group.children.length, 1);
    assert.strictEqual(group.children[0].label, "android");
  });

  // ── Platform-dispatch nodes ────────────────────────────────────

  test("parses platform-dispatch node as leaf with isPlatformDispatch=true", async () => {
    const p = writePubspec(`
name: example
scripts:
  run:
    (linux): flutter run -d linux
    (macos): flutter run -d macos
    (windows): flutter run -d windows
`);
    const result = await parseMerryScripts(p);
    assert.ok(result);
    const node = result.nodes.find((n) => n.label === "run");
    assert.ok(node, "Expected 'run' node");
    assert.strictEqual(node.isGroup, false, "Platform-dispatch should be leaf");
    assert.strictEqual(node.isPlatformDispatch, true);
    assert.strictEqual(node.commands.length, 3);
    assert.ok(node.commands.includes("flutter run -d linux"));
    assert.ok(node.commands.includes("flutter run -d macos"));
    assert.ok(node.commands.includes("flutter run -d windows"));
  });

  test("platform-dispatch node preserves (description)", async () => {
    const p = writePubspec(`
name: example
scripts:
  run:
    (description): Run the app on the current platform
    (linux): flutter run -d linux
    (macos): flutter run -d macos
`);
    const result = await parseMerryScripts(p);
    assert.ok(result);
    const node = result.nodes.find((n) => n.label === "run");
    assert.ok(node);
    assert.strictEqual(node.description, "Run the app on the current platform");
    assert.strictEqual(node.isPlatformDispatch, true);
  });

  test("map with only non-platform meta-keys is skipped", async () => {
    const p = writePubspec(`
name: example
scripts:
  (variables):
    APP_NAME: my_app
  test: flutter test
`);
    const result = await parseMerryScripts(p);
    assert.ok(result);
    // (variables) is a meta-key at top level — skipped entirely
    assert.strictEqual(result.nodes.length, 1);
    assert.strictEqual(result.nodes[0].label, "test");
  });

  test("(aliases) only map inside group is skipped", async () => {
    const p = writePubspec(`
name: example
scripts:
  upgrade:
    (description): Upgrade deps
    (scripts): flutter pub upgrade
    (aliases):
      - up
`);
    const result = await parseMerryScripts(p);
    assert.ok(result);
    // upgrade has (scripts) → leaf, (aliases) is skipped
    const node = result.nodes.find((n) => n.label === "upgrade");
    assert.ok(node);
    assert.strictEqual(node.isGroup, false);
    assert.deepStrictEqual(node.commands, ["flutter pub upgrade"]);
  });

  // ── Pre/post hook detection ────────────────────────────────────

  test("marks preX as hook when X exists", async () => {
    const p = writePubspec(`
name: example
scripts:
  pretest: flutter clean
  test: flutter test
  posttest: echo done
`);
    const result = await parseMerryScripts(p);
    assert.ok(result);

    const pretest = result.nodes.find((n) => n.label === "pretest");
    assert.ok(pretest);
    assert.strictEqual(pretest.isHook, true);

    const posttest = result.nodes.find((n) => n.label === "posttest");
    assert.ok(posttest);
    assert.strictEqual(posttest.isHook, true);

    const test = result.nodes.find((n) => n.label === "test");
    assert.ok(test);
    assert.strictEqual(test.isHook, false);
  });

  test("does not mark preX as hook when X does not exist", async () => {
    const p = writePubspec(`
name: example
scripts:
  pretest: flutter clean
`);
    const result = await parseMerryScripts(p);
    assert.ok(result);
    const pretest = result.nodes.find((n) => n.label === "pretest");
    assert.ok(pretest);
    assert.strictEqual(pretest.isHook, false);
  });

  test("does not mark 'pre' (bare) as hook", async () => {
    const p = writePubspec(`
name: example
scripts:
  pre: echo prefix-script
`);
    const result = await parseMerryScripts(p);
    assert.ok(result);
    const pre = result.nodes.find((n) => n.label === "pre");
    assert.ok(pre);
    assert.strictEqual(pre.isHook, false);
  });

  // ── External file reference ────────────────────────────────────

  test("loads external scripts file when scripts is a string path", async () => {
    const scriptsFile = path.join(tmpDir, "merry.yaml");
    fs.writeFileSync(scriptsFile, "test: flutter test\n", "utf8");

    const p = writePubspec(`
name: example
scripts: merry.yaml
`);
    const result = await parseMerryScripts(p);
    assert.ok(result);
    assert.strictEqual(result.scriptsFilePath, scriptsFile);
    assert.strictEqual(result.nodes.length, 1);
    assert.strictEqual(result.nodes[0].label, "test");
  });

  test("returns null when external scripts file is missing", async () => {
    const p = writePubspec(`
name: example
scripts: missing-scripts.yaml
`);
    assert.strictEqual(await parseMerryScripts(p), null);
  });

  // ── fullPath construction ──────────────────────────────────────

  test("fullPath equals label for top-level scripts", async () => {
    const p = writePubspec(`
name: example
scripts:
  test: flutter test
  build: flutter build apk
`);
    const result = await parseMerryScripts(p);
    assert.ok(result);
    for (const node of result.nodes) {
      assert.strictEqual(node.fullPath, node.label);
    }
  });

  test("fullPath uses space as nesting delimiter", async () => {
    const p = writePubspec(`
name: example
scripts:
  build:
    android:
      release: flutter build apk --release
`);
    const result = await parseMerryScripts(p);
    assert.ok(result);
    const release = findNode(result.nodes, "release");
    assert.ok(release);
    assert.strictEqual(release.fullPath, "build android release");
  });
});
