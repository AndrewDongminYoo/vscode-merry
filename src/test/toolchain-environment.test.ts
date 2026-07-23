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
    if (process.platform !== "win32") {
      fs.chmodSync(
        path.join(sdk, "bin", "cache", "dart-sdk", "bin", executable),
        0o755,
      );
    }
    return sdk;
  }

  function makeDartSdk(name: string): string {
    const sdk = path.join(root, name);
    const executable = process.platform === "win32" ? "dart.exe" : "dart";
    fs.mkdirSync(path.join(sdk, "bin"), { recursive: true });
    fs.writeFileSync(path.join(sdk, "bin", executable), "");
    if (process.platform !== "win32") {
      fs.chmodSync(path.join(sdk, "bin", executable), 0o755);
    }
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
    if (process.platform !== "win32") {
      fs.chmodSync(path.join(sdk, "bin", executable), 0o755);
    }

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

  test("expands forward-slash home paths on Windows", async () => {
    const homeDirectory = path.join(root, "home");
    const sdk = path.join(homeDirectory, "standalone");
    fs.mkdirSync(path.join(sdk, "bin"), { recursive: true });
    fs.writeFileSync(path.join(sdk, "bin", "dart.exe"), "");

    const result = await resolveToolchainEnvironment(
      {
        ...baseInput("dart"),
        homeDirectory,
        platform: "win32",
        dartSdkPath: "~/standalone",
      },
      { runSdkCommand: async () => "" },
    );

    assert.strictEqual(result.kind, "resolved");
    if (result.kind !== "resolved") return;
    assert.strictEqual(
      result.dartExecutable,
      path.join(sdk, "bin", "dart.exe"),
    );
  });

  test("invalid implicit SDK setting falls through to the command", async () => {
    const selected = makeDartSdk("command-selected");
    const result = await resolveToolchainEnvironment(
      {
        ...baseInput("dart"),
        dartSdkPath: path.join(root, "missing-sdk"),
        dartGetDartSdkCommand: "select-dart",
      },
      { runSdkCommand: async () => selected },
    );

    assert.strictEqual(result.kind, "resolved");
    if (result.kind !== "resolved") return;
    assert.strictEqual(result.sources.dart, "dart-code-command");
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

  test("missing inherited PUB_CACHE is accepted when its parent is writable", async () => {
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

    assert.strictEqual(result.kind, "resolved");
    if (result.kind !== "resolved") return;
    assert.strictEqual(result.pubCache, missingCache);
    assert.strictEqual(result.sources.pubCache, "environment");
  });

  test("inaccessible explicit Pub cache is rejected", async function () {
    if (process.platform === "win32") this.skip();
    const cache = makeCache("inaccessible-cache");
    fs.chmodSync(cache, 0o000);
    const result = await resolveToolchainEnvironment(
      {
        ...baseInput("dart"),
        merryPubCachePath: cache,
        dartSdkPath: makeDartSdk("standalone"),
      },
      { runSdkCommand: async () => "" },
    );
    fs.chmodSync(cache, 0o700);

    assert.deepStrictEqual(result, {
      kind: "pub-cache-unavailable",
      source: "merry-setting",
      path: cache,
      reason: "Directory is not readable and writable",
    });
  });

  test("missing default Pub cache remains available for Dart to create", async () => {
    const input = baseInput("dart");
    const result = await resolveToolchainEnvironment(
      {
        ...input,
        merryPubCachePath: undefined,
        dartSdkPath: makeDartSdk("standalone"),
      },
      { runSdkCommand: async () => "" },
    );

    assert.strictEqual(result.kind, "resolved");
    if (result.kind !== "resolved") return;
    assert.strictEqual(
      result.pubCache,
      path.join(input.homeDirectory, ".pub-cache"),
    );
    assert.strictEqual(result.sources.pubCache, "home-default");
  });

  test("missing explicit Pub cache is accepted when its parent is writable", async () => {
    const cache = path.join(root, "new-cache");
    const result = await resolveToolchainEnvironment(
      {
        ...baseInput("dart"),
        merryPubCachePath: cache,
        dartSdkPath: makeDartSdk("standalone"),
      },
      { runSdkCommand: async () => "" },
    );

    assert.strictEqual(result.kind, "resolved");
    if (result.kind !== "resolved") return;
    assert.strictEqual(result.pubCache, cache);
    assert.strictEqual(result.sources.pubCache, "merry-setting");
  });

  test("missing default Pub cache rejects an inaccessible parent", async function () {
    if (process.platform === "win32") this.skip();
    const parent = path.join(root, "inaccessible-parent");
    fs.mkdirSync(parent);
    fs.chmodSync(parent, 0o000);
    const result = await resolveToolchainEnvironment(
      {
        ...baseInput("dart"),
        homeDirectory: path.join(parent, "home"),
        merryPubCachePath: undefined,
        dartSdkPath: makeDartSdk("standalone"),
      },
      { runSdkCommand: async () => "" },
    );
    fs.chmodSync(parent, 0o700);

    assert.deepStrictEqual(result, {
      kind: "pub-cache-unavailable",
      source: "home-default",
      path: path.join(parent, "home", ".pub-cache"),
      reason: "Parent directory is not readable and writable",
    });
  });

  test("uses the Windows local application data Pub cache default", async () => {
    const localAppData = path.join(root, "local-app-data");
    const sdk = path.join(root, "standalone-win");
    fs.mkdirSync(path.join(sdk, "bin"), { recursive: true });
    fs.writeFileSync(path.join(sdk, "bin", "dart.exe"), "");
    const result = await resolveToolchainEnvironment(
      {
        ...baseInput("dart"),
        platform: "win32",
        merryPubCachePath: undefined,
        dartSdkPath: sdk,
        environment: { PATH: "", LOCALAPPDATA: localAppData },
      },
      { runSdkCommand: async () => "" },
    );

    assert.strictEqual(result.kind, "resolved");
    if (result.kind !== "resolved") return;
    assert.strictEqual(
      result.pubCache,
      path.join(localAppData, "Pub", "Cache"),
    );
  });

  test("resolves Dart from PATH and preserves its bin directory", async () => {
    const sdk = makeDartSdk("path-sdk");
    const sdkBin = path.join(sdk, "bin");
    const result = await resolveToolchainEnvironment(
      {
        ...baseInput("dart"),
        environment: { PATH: sdkBin },
      },
      { runSdkCommand: async () => "" },
    );

    assert.strictEqual(result.kind, "resolved");
    if (result.kind !== "resolved") return;
    assert.strictEqual(result.sources.dart, "path");
    assert.strictEqual(
      result.environment["PATH"]?.split(path.delimiter)[0],
      sdkBin,
    );
  });

  test("preserves inherited Windows Path entries with canonical casing", async () => {
    const sdk = path.join(root, "standalone-win");
    fs.mkdirSync(path.join(sdk, "bin"), { recursive: true });
    fs.writeFileSync(path.join(sdk, "bin", "dart.exe"), "");
    const inherited = path.join(root, "inherited-bin");
    const result = await resolveToolchainEnvironment(
      {
        ...baseInput("dart"),
        platform: "win32",
        dartSdkPath: sdk,
        environment: { Path: inherited },
      },
      { runSdkCommand: async () => "" },
    );

    assert.strictEqual(result.kind, "resolved");
    if (result.kind !== "resolved") return;
    assert.strictEqual(result.environment["Path"], undefined);
    assert.ok(result.environment["PATH"]?.includes(inherited));
  });

  test("discovers Dart from a case-insensitive Windows Path key", async () => {
    const sdk = path.join(root, "path-sdk-win");
    const sdkBin = path.join(sdk, "bin");
    fs.mkdirSync(sdkBin, { recursive: true });
    fs.writeFileSync(path.join(sdkBin, "dart.exe"), "");
    const result = await resolveToolchainEnvironment(
      {
        ...baseInput("dart"),
        platform: "win32",
        environment: { Path: sdkBin },
      },
      { runSdkCommand: async () => "" },
    );

    assert.strictEqual(result.kind, "resolved");
    if (result.kind !== "resolved") return;
    assert.strictEqual(result.sources.dart, "path");
    assert.ok(result.environment["PATH"]?.includes(sdkBin));
  });

  test("standalone Dart removes an inherited Flutter root", async () => {
    const result = await resolveToolchainEnvironment(
      {
        ...baseInput("dart"),
        dartSdkPath: makeDartSdk("standalone"),
        environment: {
          PATH: "",
          FLUTTER_ROOT: makeFlutterSdk("inherited-flutter"),
        },
      },
      { runSdkCommand: async () => "" },
    );

    assert.strictEqual(result.kind, "resolved");
    if (result.kind !== "resolved") return;
    assert.strictEqual(result.flutterRoot, undefined);
    assert.strictEqual(result.environment["FLUTTER_ROOT"], undefined);
  });

  test("rejects a non-executable standalone Dart SDK", async function () {
    if (process.platform === "win32") this.skip();
    const sdk = makeDartSdk("non-executable");
    fs.chmodSync(path.join(sdk, "bin", "dart"), 0o644);
    const result = await resolveToolchainEnvironment(
      {
        ...baseInput("dart"),
        merryDartSdkPath: sdk,
      },
      { runSdkCommand: async () => "" },
    );

    assert.deepStrictEqual(result, {
      kind: "invalid-configuration",
      setting: "merry.dartSdkPath",
      reason: "Path is not a Dart or Flutter SDK root",
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
