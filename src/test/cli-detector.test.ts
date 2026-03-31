import * as assert from "assert";
import { parseGlobalList } from "../cli-detector";

suite("CliDetector › parseGlobalList", () => {
  test("returns merry when present", () => {
    const output = "flutter_tools 0.0.0\nmerry 2.0.0\nsome_package 1.0.0\n";
    assert.strictEqual(parseGlobalList(output), "merry");
  });

  test("returns derry when only derry is present", () => {
    const output = "flutter_tools 0.0.0\nderry 0.1.6\nsome_package 1.0.0\n";
    assert.strictEqual(parseGlobalList(output), "derry");
  });

  test("prefers merry over derry when both present", () => {
    const output = "derry 0.1.6\nmerry 2.0.0\n";
    assert.strictEqual(parseGlobalList(output), "merry");
  });

  test("prefers merry regardless of order", () => {
    const output = "merry 2.0.0\nderry 0.1.6\n";
    assert.strictEqual(parseGlobalList(output), "merry");
  });

  test("returns null when neither merry nor derry found", () => {
    const output = "flutter_tools 0.0.0\nfvm 3.0.0\nglobal_packages 1.0.0\n";
    assert.strictEqual(parseGlobalList(output), null);
  });

  test("returns null for empty output", () => {
    assert.strictEqual(parseGlobalList(""), null);
  });

  test("returns null for whitespace-only output", () => {
    assert.strictEqual(parseGlobalList("   \n  \n"), null);
  });

  test("handles partial name matches without false positives", () => {
    // 'merry-extra' and 'derry-fork' must not match
    const output = "merry-extra 1.0.0\nderry-fork 0.5.0\n";
    assert.strictEqual(parseGlobalList(output), null);
  });

  test("handles leading/trailing whitespace on each line", () => {
    const output = "  merry 2.0.0  \n";
    assert.strictEqual(parseGlobalList(output), "merry");
  });

  test("handles Windows-style CRLF line endings", () => {
    const output = "flutter_tools 0.0.0\r\nmerry 2.0.0\r\n";
    assert.strictEqual(parseGlobalList(output), "merry");
  });
});
