import * as assert from "assert";

import { parseGlobalList } from "../cli-detector";

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
