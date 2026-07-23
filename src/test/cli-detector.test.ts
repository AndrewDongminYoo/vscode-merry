import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import { detectMerryCli, parseGlobalList } from "../cli-detector";
import type { ResolvedToolchainEnvironment } from "../toolchain-environment";

suite("CliDetector › parseGlobalList", () => {
  test("returns merry when present", () => {
    const result = parseGlobalList(
      "flutter_tools 0.0.0\nmerry 2.0.0\nsome_package 1.0.0\n",
    );
    assert.strictEqual(result?.cli, "merry");
    assert.strictEqual(result?.version, "2.0.0");
  });

  test("returns derry when only derry is present", () => {
    const result = parseGlobalList(
      "flutter_tools 0.0.0\nderry 0.1.6\nsome_package 1.0.0\n",
    );
    assert.strictEqual(result?.cli, "derry");
    assert.strictEqual(result?.version, "0.1.6");
  });

  test("prefers merry over derry when both present", () => {
    const result = parseGlobalList("derry 0.1.6\nmerry 2.0.0\n");
    assert.strictEqual(result?.cli, "merry");
    assert.strictEqual(result?.version, "2.0.0");
  });

  test("prefers merry regardless of order", () => {
    const result = parseGlobalList("merry 2.0.0\nderry 0.1.6\n");
    assert.strictEqual(result?.cli, "merry");
  });

  test("returns null when neither merry nor derry found", () => {
    assert.strictEqual(
      parseGlobalList(
        "flutter_tools 0.0.0\nfvm 3.0.0\nglobal_packages 1.0.0\n",
      ),
      null,
    );
  });

  test("returns null for empty output", () => {
    assert.strictEqual(parseGlobalList(""), null);
  });

  test("returns null for whitespace-only output", () => {
    assert.strictEqual(parseGlobalList("   \n  \n"), null);
  });

  test("handles partial name matches without false positives", () => {
    // 'merry-extra' and 'derry-fork' must not match
    assert.strictEqual(
      parseGlobalList("merry-extra 1.0.0\nderry-fork 0.5.0\n"),
      null,
    );
  });

  test("handles leading/trailing whitespace on each line", () => {
    const result = parseGlobalList("  merry 2.0.0  \n");
    assert.strictEqual(result?.cli, "merry");
    assert.strictEqual(result?.version, "2.0.0");
  });

  test("handles Windows-style CRLF line endings", () => {
    const result = parseGlobalList("flutter_tools 0.0.0\r\nmerry 2.0.0\r\n");
    assert.strictEqual(result?.cli, "merry");
  });
});

suite("CliDetector › resolved environment", () => {
  let root: string;
  let toolchain: ResolvedToolchainEnvironment;

  setup(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "vscode-merry-cli-"));
    const pubCache = path.join(root, "pub-cache");
    fs.mkdirSync(path.join(pubCache, "bin"), { recursive: true });
    toolchain = {
      kind: "resolved",
      dartExecutable: path.join(root, "dart sdk", "bin", "dart"),
      pubCache,
      environment: { PATH: "", PUB_CACHE: pubCache },
      sources: { dart: "path", pubCache: "merry-setting" },
      fingerprint: "fixture",
    };
  });

  teardown(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  test("uses the resolved Dart executable and environment", async () => {
    const launcher = path.join(
      toolchain.pubCache,
      "bin",
      process.platform === "win32" ? "merry.bat" : "merry",
    );
    fs.writeFileSync(launcher, "");
    const calls: Array<{
      readonly executable: string;
      readonly args: readonly string[];
      readonly pubCache: string | undefined;
    }> = [];

    const result = await detectMerryCli(toolchain, {
      runGlobalList: async (executable, args, environment) => {
        calls.push({
          executable,
          args,
          pubCache: environment["PUB_CACHE"],
        });
        return "merry 2.0.0\n";
      },
    });

    assert.strictEqual(result.kind, "detected");
    assert.deepStrictEqual(calls, [
      {
        executable: toolchain.dartExecutable,
        args: ["pub", "global", "list"],
        pubCache: toolchain.pubCache,
      },
    ]);
    if (result.kind !== "detected") return;
    assert.strictEqual(result.info.launcherPath, launcher);
    assert.strictEqual(result.info.version, "2.0.0");
  });

  test("reports a registered package whose launcher is missing", async () => {
    const expectedPath = path.join(
      toolchain.pubCache,
      "bin",
      process.platform === "win32" ? "merry.bat" : "merry",
    );
    const result = await detectMerryCli(toolchain, {
      runGlobalList: async () => "merry 2.0.0\n",
    });

    assert.deepStrictEqual(result, {
      kind: "launcher-missing",
      cli: "merry",
      expectedPath,
    });
  });

  test("filesystem fallback preserves merry preference", async () => {
    fs.mkdirSync(path.join(toolchain.pubCache, "global_packages", "derry"), {
      recursive: true,
    });
    fs.mkdirSync(path.join(toolchain.pubCache, "global_packages", "merry"), {
      recursive: true,
    });
    const launcher = path.join(
      toolchain.pubCache,
      "bin",
      process.platform === "win32" ? "merry.bat" : "merry",
    );
    fs.writeFileSync(launcher, "");

    const result = await detectMerryCli(toolchain, {
      runGlobalList: async () => {
        throw new Error("dart unavailable");
      },
    });

    assert.strictEqual(result.kind, "detected");
    if (result.kind !== "detected") return;
    assert.strictEqual(result.info.cli, "merry");
    assert.strictEqual(result.info.version, undefined);
  });
});
