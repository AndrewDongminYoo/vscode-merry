import * as assert from "assert";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
  resolveToolchainEnvironment,
  type ToolchainResolverInput,
} from "../toolchain-environment";

suite("ToolchainEnvironment", () => {
  let root: string;

  setup(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "vscode-merry-toolchain-"));
  });

  teardown(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function makeFlutterSdk(name: string): string {
    const sdk = path.join(root, name);
    const executable = process.platform === "win32" ? "dart.exe" : "dart";
    fs.mkdirSync(path.join(sdk, "bin", "cache", "dart-sdk", "bin"), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(sdk, "bin", "cache", "dart-sdk", "bin", executable),
      "",
    );
    return sdk;
  }

  function makeDartSdk(name: string): string {
    const sdk = path.join(root, name);
    const executable = process.platform === "win32" ? "dart.exe" : "dart";
    fs.mkdirSync(path.join(sdk, "bin"), { recursive: true });
    fs.writeFileSync(path.join(sdk, "bin", executable), "");
    return sdk;
  }

  function makeCache(name = "cache"): string {
    const cache = path.join(root, name);
    fs.mkdirSync(cache, { recursive: true });
    return cache;
  }

  function baseInput(
    kind: "flutter" | "dart" = "flutter",
  ): ToolchainResolverInput {
    return {
      workspaceRoot: root,
      workspaceTrusted: true,
      workspaceKind: kind,
      homeDirectory: path.join(root, "home"),
      platform: process.platform,
      environment: { PATH: "" },
      merryPubCachePath: makeCache(),
    };
  }

  test("returns workspace-untrusted before running SDK command", async () => {
    let invoked = false;
    const result = await resolveToolchainEnvironment(
      {
        ...baseInput(),
        workspaceTrusted: false,
        dartGetFlutterSdkCommand: "select-flutter",
      },
      {
        runSdkCommand: async () => {
          invoked = true;
          return makeFlutterSdk("must-not-run");
        },
      },
    );

    assert.deepStrictEqual(result, { kind: "workspace-untrusted" });
    assert.strictEqual(invoked, false);
  });

  test("explicit Merry SDK wins over every Flutter candidate", async () => {
    const explicit = makeFlutterSdk("explicit");
    const dartCode = makeFlutterSdk("dart-code");
    const inherited = makeFlutterSdk("inherited");
    makeFlutterSdk(path.join(".fvm", "flutter_sdk"));

    const result = await resolveToolchainEnvironment(
      {
        ...baseInput(),
        merryDartSdkPath: explicit,
        dartFlutterSdkPath: dartCode,
        dartGetFlutterSdkCommand: "select-flutter",
        environment: {
          FLUTTER_ROOT: inherited,
          PATH: path.join(inherited, "bin"),
        },
      },
      { runSdkCommand: async () => makeFlutterSdk("command") },
    );

    assert.strictEqual(result.kind, "resolved");
    if (result.kind !== "resolved") return;
    assert.strictEqual(result.flutterRoot, explicit);
    assert.strictEqual(result.sources.dart, "merry-setting");
  });

  test("Flutter workspace uses Dart Code setting before command and FVM", async () => {
    const setting = makeFlutterSdk("setting");
    makeFlutterSdk(path.join(".fvm", "flutter_sdk"));

    const result = await resolveToolchainEnvironment(
      {
        ...baseInput(),
        dartFlutterSdkPath: setting,
        dartGetFlutterSdkCommand: "select-flutter",
      },
      { runSdkCommand: async () => makeFlutterSdk("command") },
    );

    assert.strictEqual(result.kind, "resolved");
    if (result.kind !== "resolved") return;
    assert.strictEqual(result.flutterRoot, setting);
    assert.strictEqual(result.sources.dart, "dart-code-setting");
  });

  test("Flutter workspace uses command before FVM", async () => {
    const selected = makeFlutterSdk("command-selected");
    makeFlutterSdk(path.join(".fvm", "flutter_sdk"));

    const result = await resolveToolchainEnvironment(
      {
        ...baseInput(),
        dartGetFlutterSdkCommand: "select-flutter",
      },
      { runSdkCommand: async () => selected },
    );

    assert.strictEqual(result.kind, "resolved");
    if (result.kind !== "resolved") return;
    assert.strictEqual(result.flutterRoot, selected);
    assert.strictEqual(result.sources.dart, "dart-code-command");
  });

  test("Flutter workspace falls back to FVM", async () => {
    const fvm = makeFlutterSdk(path.join(".fvm", "flutter_sdk"));
    const result = await resolveToolchainEnvironment(baseInput(), {
      runSdkCommand: async () => "",
    });

    assert.strictEqual(result.kind, "resolved");
    if (result.kind !== "resolved") return;
    assert.strictEqual(result.flutterRoot, fvm);
    assert.strictEqual(result.sources.dart, "fvm");
  });

  test("standalone workspace uses dart.sdkPath and ignores FVM", async () => {
    const standalone = makeDartSdk("standalone");
    makeFlutterSdk(path.join(".fvm", "flutter_sdk"));
    const result = await resolveToolchainEnvironment(
      {
        ...baseInput("dart"),
        dartSdkPath: standalone,
      },
      { runSdkCommand: async () => "" },
    );

    assert.strictEqual(result.kind, "resolved");
    if (result.kind !== "resolved") return;
    assert.strictEqual(
      result.dartExecutable,
      path.join(
        standalone,
        "bin",
        process.platform === "win32" ? "dart.exe" : "dart",
      ),
    );
    assert.strictEqual(result.sources.dart, "dart-code-setting");
  });

  test("Dart Code SDK settings expand the user home directory", async () => {
    const homeDirectory = path.join(root, "home");
    const sdk = path.join(homeDirectory, "standalone");
    const executable = process.platform === "win32" ? "dart.exe" : "dart";
    fs.mkdirSync(path.join(sdk, "bin"), { recursive: true });
    fs.writeFileSync(path.join(sdk, "bin", executable), "");

    const result = await resolveToolchainEnvironment(
      {
        ...baseInput("dart"),
        homeDirectory,
        dartSdkPath: `~${path.sep}standalone`,
      },
      { runSdkCommand: async () => "" },
    );

    assert.strictEqual(result.kind, "resolved");
    if (result.kind !== "resolved") return;
    assert.strictEqual(
      result.dartExecutable,
      path.join(sdk, "bin", executable),
    );
    assert.strictEqual(result.sources.dart, "dart-code-setting");
  });

  test("FLUTTER_ROOT remains a fallback", async () => {
    const inherited = makeFlutterSdk("inherited");
    const result = await resolveToolchainEnvironment(
      {
        ...baseInput(),
        environment: { FLUTTER_ROOT: inherited, PATH: "" },
      },
      { runSdkCommand: async () => "" },
    );

    assert.strictEqual(result.kind, "resolved");
    if (result.kind !== "resolved") return;
    assert.strictEqual(result.flutterRoot, inherited);
    assert.strictEqual(result.sources.dart, "flutter-root");
  });

  test("expands workspace and environment substitutions", async () => {
    const sdk = makeDartSdk("configured-sdk");
    const cache = makeCache("external-cache");
    const result = await resolveToolchainEnvironment(
      {
        ...baseInput("dart"),
        merryDartSdkPath: "${workspaceFolder}/configured-sdk",
        merryPubCachePath: "${env:CACHE_ROOT}",
        environment: { PATH: "", CACHE_ROOT: cache },
      },
      { runSdkCommand: async () => "" },
    );

    assert.strictEqual(result.kind, "resolved");
    if (result.kind !== "resolved") return;
    assert.strictEqual(
      result.dartExecutable,
      path.join(sdk, "bin", process.platform === "win32" ? "dart.exe" : "dart"),
    );
    assert.strictEqual(result.pubCache, cache);
  });

  test("invalid explicit substitution blocks fallback", async () => {
    const result = await resolveToolchainEnvironment(
      {
        ...baseInput("dart"),
        merryDartSdkPath: "${env:MISSING_SDK}",
        dartSdkPath: makeDartSdk("fallback"),
      },
      { runSdkCommand: async () => "" },
    );

    assert.strictEqual(result.kind, "invalid-configuration");
    if (result.kind !== "invalid-configuration") return;
    assert.strictEqual(result.setting, "merry.dartSdkPath");
  });

  test("inaccessible inherited PUB_CACHE is authoritative", async () => {
    const missingCache = path.join(root, "missing-cache");
    const result = await resolveToolchainEnvironment(
      {
        ...baseInput("dart"),
        merryPubCachePath: undefined,
        dartSdkPath: makeDartSdk("standalone"),
        environment: { PATH: "", PUB_CACHE: missingCache },
      },
      { runSdkCommand: async () => "" },
    );

    assert.deepStrictEqual(result, {
      kind: "pub-cache-unavailable",
      source: "environment",
      path: missingCache,
      reason: "Directory does not exist",
    });
  });

  test("selected Flutter bin precedes Pub cache and inherited PATH", async () => {
    const flutter = makeFlutterSdk("flutter");
    const cache = makeCache("pub-cache");
    const inherited = path.join(root, "inherited-bin");
    const result = await resolveToolchainEnvironment(
      {
        ...baseInput(),
        merryDartSdkPath: flutter,
        merryPubCachePath: cache,
        environment: { PATH: inherited },
      },
      { runSdkCommand: async () => "" },
    );

    assert.strictEqual(result.kind, "resolved");
    if (result.kind !== "resolved") return;
    assert.deepStrictEqual(result.environment["PATH"]?.split(path.delimiter), [
      path.join(flutter, "bin"),
      path.join(cache, "bin"),
      inherited,
    ]);
  });
});
