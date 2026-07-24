# Dart and Pub Environment Resolution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make CLI detection, Explorer execution, VS Code Tasks, and Merry installation use one trusted, workspace-resolved Dart and Pub environment that supports FVM, standalone Dart, and external Pub caches.

**Architecture:** Add a pure `toolchain-environment` boundary that resolves SDK, cache, substitutions, trust, and child environment without importing VS Code.
Add a `MerryExecutionService` that adapts VS Code configuration into that resolver, owns CLI detection and terminal lifecycle, and emits execution-context changes to the task provider.
Keep `extension.ts` as command/provider wiring so it does not absorb another responsibility.

**Tech Stack:** TypeScript 6, Node.js `child_process`/`fs`/`path`, VS Code Extension API 1.115, Mocha with Node `assert`, pnpm, existing esbuild and ESLint toolchain.

## Global Constraints

- Design contract: `docs/specs/2026-07-23-dart-pub-environment-resolution-design.md`.
- Resolution precedence: explicit Merry settings, selected Dart Code SDK or command, FVM, inherited `FLUTTER_ROOT`/`PUB_CACHE`/`PATH`, then system defaults.
- `PUB_CACHE` is authoritative when explicitly configured or inherited and is never derived implicitly from `FLUTTER_ROOT`.
- No SDK selection command, Dart executable, Merry executable, Derry executable, or install command runs before `workspace.isTrusted` is true.
- Detection, Explorer terminal, Tasks, and installation consume the same resolved context.
- Preserve `merry` over `derry`, all public command IDs, nested space-delimited script paths, terminal reuse behavior, and the install-prompt-only missing-CLI policy.
- Do not add dependencies or modify the lockfile.
- Do not use `any`, type assertions, non-null assertions, `@ts-ignore`, or `@ts-expect-error` in new code.
- Every production behavior starts with a failing test and uses distinct candidate paths so precedence regressions fail.
- Tests must not depend on globally installed Dart, Flutter, FVM, Merry, or Derry.

---

## File Map

| Action | Path | Responsibility |
| --- | --- | --- |
| Create | `src/toolchain-environment.ts` | Pure trust, substitution, SDK, Pub cache, `PATH`, and fingerprint resolution. |
| Create | `src/test/toolchain-environment.test.ts` | Temporary-filesystem tests for precedence, substitutions, trust, and portability. |
| Modify | `src/cli-detector.ts` | Detect packages with the resolved absolute Dart executable and Pub environment. |
| Modify | `src/test/cli-detector.test.ts` | Preserve parser tests and add execution-ready launcher tests. |
| Create | `src/merry-execution-service.ts` | VS Code configuration adapter, context lifecycle, terminal/install behavior, and diagnostics. |
| Create | `src/test/merry-execution-service.test.ts` | Context lifecycle and shell-command formatting tests. |
| Modify | `src/merry-task-provider.ts` | Build strongly quoted tasks from an execution-ready context. |
| Modify | `src/test/merry-task-provider.test.ts` | Assert executable, arguments, environment, and cache invalidation. |
| Modify | `src/extension.ts` | Wire `MerryExecutionService` to commands, status UI, and task provider. |
| Modify | `src/test/integration.test.ts` | Verify trust/configuration wiring and existing command registration. |
| Modify | `.vscode-test.mjs` | Run the currently omitted task-provider suite and the two new suites in the correct workspace mode. |
| Modify | `package.json` | Declare `merry.dartSdkPath` and `merry.pubCachePath`. |
| Modify | `CLAUDE.md` | Document the resolved detection/execution flow. |

`src/extension.ts` is already 276 lines.
New resolution and execution lifecycle behavior must live in the two new focused modules rather than increasing that file's responsibility.

---

### Task 1: Resolve a Trusted Toolchain and Pub Environment

**Files:**

- Create: `src/toolchain-environment.ts`
- Create: `src/test/toolchain-environment.test.ts`
- Modify: `.vscode-test.mjs`

**Interfaces:**

- Consumes: filesystem paths, a process-like environment, workspace type/trust, Merry settings, Dart Code settings, and an injected SDK-command runner.
- Produces: `resolveToolchainEnvironment(input, dependencies): Promise<ToolchainResolution>`, `ResolvedToolchainEnvironment`, `ToolchainResolution`, and `ToolchainSource`.

- [ ] **Step 1: Register the new pure test suite**

Change the unit-suite glob in `.vscode-test.mjs` so the new resolver runs without a workspace:

```javascript
files:
  "out/test/{extension,merry-parser,cli-detector,merry-codelens-provider,toolchain-environment}.test.js",
```

- [ ] **Step 2: Write failing trust and precedence tests**

Create `src/test/toolchain-environment.test.ts` with temporary SDK/cache fixtures and dependency injection:

```typescript
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

  function baseInput(): ToolchainResolverInput {
    return {
      workspaceRoot: root,
      workspaceTrusted: true,
      workspaceKind: "flutter",
      homeDirectory: path.join(root, "home"),
      platform: process.platform,
      environment: { PATH: "" },
    };
  }

  test("returns workspace-untrusted before resolving an SDK", async () => {
    const result = await resolveToolchainEnvironment(
      { ...baseInput(), workspaceTrusted: false },
      { runSdkCommand: async () => makeFlutterSdk("must-not-run") },
    );
    assert.deepStrictEqual(result, { kind: "workspace-untrusted" });
  });

  test("explicit Merry SDK wins over Dart Code, FVM, environment, and PATH", async () => {
    const explicit = makeFlutterSdk("explicit");
    const dartCode = makeFlutterSdk("dart-code");
    const inherited = makeFlutterSdk("inherited");
    const result = await resolveToolchainEnvironment(
      {
        ...baseInput(),
        merryDartSdkPath: explicit,
        dartFlutterSdkPath: dartCode,
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

  test("Flutter workspace uses Dart Code command before FVM", async () => {
    const selected = makeFlutterSdk("command-selected");
    const fvm = makeFlutterSdk(path.join(".fvm", "flutter_sdk"));
    assert.ok(fvm.endsWith(path.join(".fvm", "flutter_sdk")));
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
});
```

Add separate tests in the same suite for standalone `dart.sdkPath`, FVM fallback, `FLUTTER_ROOT`, inherited `PATH`, `~`/`${workspaceFolder}`/`${env:NAME}` substitution, unresolved substitutions, authoritative inaccessible `PUB_CACHE`, default missing cache, Windows launcher names, and selected-SDK-first `PATH`.
Each test must construct a distinct path for every populated candidate and assert both the selected path and `sources`.

- [ ] **Step 3: Run the suite and confirm the intended red state**

Run:

```bash
pnpm run compile-tests
```

Expected: `TS2307` for `../toolchain-environment`.

- [ ] **Step 4: Add the typed resolver boundary**

Create these exported contracts in `src/toolchain-environment.ts`:

```typescript
import * as fs from "fs";
import * as path from "path";

export type ToolchainSource =
  | "merry-setting"
  | "dart-code-setting"
  | "dart-code-command"
  | "fvm"
  | "flutter-root"
  | "path";

export type PubCacheSource =
  | "merry-setting"
  | "environment"
  | "home-default";

export interface ToolchainResolverInput {
  readonly workspaceRoot: string;
  readonly workspaceTrusted: boolean;
  readonly workspaceKind: "flutter" | "dart";
  readonly homeDirectory: string;
  readonly platform: NodeJS.Platform;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly merryDartSdkPath?: string;
  readonly merryPubCachePath?: string;
  readonly dartFlutterSdkPath?: string;
  readonly dartSdkPath?: string;
  readonly dartGetFlutterSdkCommand?: string;
  readonly dartGetDartSdkCommand?: string;
}

export interface ToolchainResolverDependencies {
  readonly runSdkCommand: (
    command: string,
    environment: Readonly<Record<string, string>>,
  ) => Promise<string>;
}

export interface ResolvedToolchainEnvironment {
  readonly kind: "resolved";
  readonly dartExecutable: string;
  readonly flutterRoot?: string;
  readonly pubCache: string;
  readonly environment: Readonly<Record<string, string>>;
  readonly sources: {
    readonly dart: ToolchainSource;
    readonly pubCache: PubCacheSource;
  };
  readonly fingerprint: string;
}

export type ToolchainResolution =
  | ResolvedToolchainEnvironment
  | { readonly kind: "workspace-untrusted" }
  | {
      readonly kind: "invalid-configuration";
      readonly setting: "merry.dartSdkPath" | "merry.pubCachePath";
      readonly reason: string;
    }
  | {
      readonly kind: "pub-cache-unavailable";
      readonly source: PubCacheSource;
      readonly path: string;
      readonly reason: string;
    }
  | {
      readonly kind: "dart-not-found";
      readonly checkedSources: readonly ToolchainSource[];
    };
```

Implement `resolveConfiguredPath()` to expand only the three approved substitutions, normalize relative paths against `workspaceRoot`, and return a typed failure for an unresolved `${env:NAME}`.
Implement `findFlutterDart()`, `findStandaloneDart()`, and `findDartOnPath()` using expected filesystem shapes and platform executable suffixes.
Evaluate candidates in the exact order from the design.
Execute Dart Code SDK commands only after the trust guard, trim stdout, require one non-empty line, validate the resulting SDK shape, and fall through on command failure.
Resolve Pub cache independently, make explicit/inherited inaccessible paths blocking, allow an absent default cache during detection, and build a string-only child environment.
Build `PATH` as selected Flutter `bin` or standalone Dart `bin`, Pub cache `bin`, then inherited entries, with platform-sensitive deduplication.
Build `fingerprint` from workspace root, Dart executable, Flutter root or empty string, Pub cache, and final `PATH`.

- [ ] **Step 5: Run resolver tests**

Run:

```bash
pnpm run compile-tests && pnpm run test -- --grep ToolchainEnvironment
```

Expected: all `ToolchainEnvironment` tests pass and no other test fails.

- [ ] **Step 6: Commit the resolver**

```bash
git add .vscode-test.mjs src/toolchain-environment.ts src/test/toolchain-environment.test.ts
git commit -m "feat: resolve Dart and Pub environments"
```

---

### Task 2: Detect an Execution-ready Merry CLI

**Files:**

- Modify: `src/cli-detector.ts`
- Modify: `src/test/cli-detector.test.ts`

**Interfaces:**

- Consumes: `ResolvedToolchainEnvironment`.
- Produces: `detectMerryCli(toolchain, dependencies?): Promise<CliDetectionResult>` and execution-ready `CliInfo`.

- [ ] **Step 1: Write failing launcher and environment tests**

Extend `src/test/cli-detector.test.ts`:

```typescript
test("uses the resolved Dart executable and environment", async () => {
  const calls: Array<{
    readonly executable: string;
    readonly args: readonly string[];
    readonly pubCache: string | undefined;
  }> = [];
  const result = await detectMerryCli(resolvedToolchain, {
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
      executable: resolvedToolchain.dartExecutable,
      args: ["pub", "global", "list"],
      pubCache: resolvedToolchain.pubCache,
    },
  ]);
});

test("reports a registered package whose launcher is missing", async () => {
  const result = await detectMerryCli(resolvedToolchain, {
    runGlobalList: async () => "merry 2.0.0\n",
  });
  assert.deepStrictEqual(result, {
    kind: "launcher-missing",
    cli: "merry",
    expectedPath: path.join(
      resolvedToolchain.pubCache,
      "bin",
      process.platform === "win32" ? "merry.bat" : "merry",
    ),
  });
});
```

Create `resolvedToolchain` with a temporary Pub cache and launcher.
Retain every existing `parseGlobalList()` assertion unchanged.

- [ ] **Step 2: Run the focused red test**

Run:

```bash
pnpm run compile-tests
```

Expected: type errors because the current detector accepts no resolved environment and does not expose detection variants.

- [ ] **Step 3: Refactor detection around the resolved context**

Use these contracts:

```typescript
export interface CliInfo {
  readonly cli: MerryCli;
  readonly version?: string;
  readonly launcherPath: string;
  readonly toolchain: ResolvedToolchainEnvironment;
}

export type CliDetectionResult =
  | { readonly kind: "detected"; readonly info: CliInfo }
  | { readonly kind: "not-installed" }
  | {
      readonly kind: "launcher-missing";
      readonly cli: MerryCli;
      readonly expectedPath: string;
    };

export interface CliDetectorDependencies {
  readonly runGlobalList: (
    executable: string,
    args: readonly string[],
    environment: Readonly<Record<string, string>>,
  ) => Promise<string>;
}
```

The default dependency wraps `child_process.execFile` with a 5-second timeout, the absolute `dartExecutable`, `["pub", "global", "list"]`, and the resolved environment.
On command failure, inspect only `<pubCache>/global_packages`.
In either route, preserve exact-name parsing and `merry` preference, then require `<pubCache>/bin/<cli>` or `<cli>.bat`.
Remove all direct reads of `process.env`, `os.homedir()`, and bare `"dart"` execution from this module.

- [ ] **Step 4: Run detector tests**

Run:

```bash
pnpm run compile-tests && pnpm run test -- --grep "CliDetector"
```

Expected: parser, environment, launcher, fallback, and missing-launcher tests pass.

- [ ] **Step 5: Commit execution-ready detection**

```bash
git add src/cli-detector.ts src/test/cli-detector.test.ts
git commit -m "feat: detect Merry in resolved Pub cache"
```

---

### Task 3: Generate Tasks from the Resolved Context

**Files:**

- Modify: `.vscode-test.mjs`
- Modify: `src/merry-task-provider.ts`
- Modify: `src/test/merry-task-provider.test.ts`

**Interfaces:**

- Consumes: `() => CliInfo | null` and an `Event<void>` that signals context invalidation.
- Produces: tasks whose `ShellExecution` uses the absolute launcher, strongly quoted script argument, workspace `cwd`, and resolved environment.

- [ ] **Step 1: Put the existing omitted suite under the workspace test run**

Change the integration entry in `.vscode-test.mjs`:

```javascript
{
  files:
    "out/test/{integration,merry-task-provider,merry-execution-service}.test.js",
  workspaceFolder: "./test-workspace",
},
```

- [ ] **Step 2: Replace the weak command-line assertion with failing structural assertions**

Update the task-provider setup to supply a `CliInfo` fixture whose launcher and Pub cache contain spaces.
Replace the existing substring test with:

```typescript
test("task uses the resolved launcher, strong script quoting, cwd, and env", () => {
  const aab = provider.provideTasks().find((task) => task.name === "build aab");
  assert.ok(aab);
  const execution = aab.execution;
  assert.ok(execution instanceof vscode.ShellExecution);
  assert.deepStrictEqual(execution.command, context.launcherPath);
  assert.deepStrictEqual(execution.args, [
    "run",
    {
      value: "build aab",
      quoting: vscode.ShellQuoting.Strong,
    },
  ]);
  assert.strictEqual(execution.options?.cwd, workspaceRoot);
  assert.strictEqual(
    execution.options?.env?.["PUB_CACHE"],
    context.toolchain.pubCache,
  );
});
```

Add a fixture node whose full path includes shell metacharacters and assert it remains one strongly quoted argument.
Add an `EventEmitter<void>` to the test fixture and assert firing it rebuilds the cached task array.

- [ ] **Step 3: Run the workspace suite and confirm red**

Run:

```bash
pnpm run compile-tests && pnpm run test -- --grep MerryTaskProvider
```

Expected: the task provider tests now run and fail because the provider still accepts only a CLI name and constructs a command-line string.

- [ ] **Step 4: Change the provider to consume `CliInfo`**

Change the constructor to:

```typescript
constructor(
  private readonly service: MerryScriptService,
  private readonly workspaceRoot: string,
  private readonly getCliInfo: () => CliInfo | null,
  onDidChangeCliInfo: Event<void>,
)
```

Subscribe both `service.onDidChangeScripts` and `onDidChangeCliInfo` to one cache invalidation method.
Return an empty task array when `getCliInfo()` returns null.
Construct execution as:

```typescript
new ShellExecution(
  cliInfo.launcherPath,
  [
    "run",
    {
      value: node.fullPath,
      quoting: ShellQuoting.Strong,
    },
  ],
  {
    cwd: this.workspaceRoot,
    env: cliInfo.toolchain.environment,
  },
)
```

Keep task names, details, groups, source, and leaf collection unchanged.

- [ ] **Step 5: Run task tests**

Run:

```bash
pnpm run compile-tests && pnpm run test -- --grep MerryTaskProvider
```

Expected: all task-provider tests pass, including the previously omitted existing coverage.

- [ ] **Step 6: Commit task execution**

```bash
git add .vscode-test.mjs src/merry-task-provider.ts src/test/merry-task-provider.test.ts
git commit -m "feat: run Merry tasks in resolved environment"
```

---

### Task 4: Own Resolution and Terminal Lifecycle in `MerryExecutionService`

**Files:**

- Create: `src/merry-execution-service.ts`
- Create: `src/test/merry-execution-service.test.ts`
- Modify: `src/extension.ts`
- Modify: `src/test/integration.test.ts`

**Interfaces:**

- Consumes: workspace root, workspace trust/configuration, `resolveToolchainEnvironment()`, and `detectMerryCli()`.
- Produces: `currentCliInfo`, `onDidChangeCliInfo`, `initialize()`, `refresh()`, `runScript()`, `installMerry()`, and `dispose()`.

- [ ] **Step 1: Write failing shell formatting and lifecycle tests**

Create `src/test/merry-execution-service.test.ts`.
Test a pure exported formatter independently from terminal creation:

```typescript
suite("MerryExecutionService", () => {
  test("quotes POSIX launcher and script as separate shell words", () => {
    assert.strictEqual(
      formatTerminalCommand(
        "/Volumes/External Cache/bin/merry",
        "build release; echo injected",
        "posix",
      ),
      "'/Volumes/External Cache/bin/merry' 'run' 'build release; echo injected'",
    );
  });

  test("quotes embedded POSIX apostrophes", () => {
    assert.strictEqual(
      formatTerminalCommand("/cache/bin/merry", "customer's build", "posix"),
      "'/cache/bin/merry' 'run' 'customer'\"'\"'s build'",
    );
  });
});
```

Add PowerShell and `cmd.exe` cases with spaces, quotes, `&`, `|`, `;`, `$`, and `%`.
Add service tests with injected resolver/detector/terminal adapters proving: untrusted initialization performs no detection, granting trust resolves once, a relevant setting change replaces the context and fires once, irrelevant settings do nothing, and a changed fingerprint creates a new terminal instead of reusing the old one.

- [ ] **Step 2: Run compile/tests and confirm red**

Run:

```bash
pnpm run compile-tests
```

Expected: `TS2307` for `../merry-execution-service`.

- [ ] **Step 3: Implement the service and configuration adapter**

Export:

```typescript
export type TerminalShell = "posix" | "powershell" | "cmd";

export function formatTerminalCommand(
  launcherPath: string,
  scriptPath: string,
  shell: TerminalShell,
): string;

export class MerryExecutionService implements Disposable {
  readonly onDidChangeCliInfo: Event<void>;
  get currentCliInfo(): CliInfo | null;
  initialize(): Promise<void>;
  refresh(): Promise<void>;
  runScript(scriptPath: string): Promise<void>;
  installMerry(): Promise<void>;
  dispose(): void;
}
```

The constructor accepts `ExtensionContext`, `workspaceRoot`, and a narrow optional dependency object for tests.
The adapter reads:

```typescript
workspace.getConfiguration("merry").get<string>("dartSdkPath");
workspace.getConfiguration("merry").get<string>("pubCachePath");
workspace.getConfiguration("dart").get<string>("flutterSdkPath");
workspace.getConfiguration("dart").get<string>("sdkPath");
workspace.getConfiguration("dart").get<string>("getFlutterSdkCommand");
workspace.getConfiguration("dart").get<string>("getDartSdkCommand");
```

Classify the workspace by parsing the existing root `pubspec.yaml` and checking whether `dependencies.flutter.sdk === "flutter"` or `dev_dependencies.flutter.sdk === "flutter"`.
Run configured Dart Code SDK commands only after trust using the platform shell with a 5-second timeout, require exactly one stdout path, and pass the current environment.
Subscribe to `workspace.onDidGrantWorkspaceTrust` and `workspace.onDidChangeConfiguration`.
Refresh only when one of the six relevant keys changes.
Before `runScript()` and `installMerry()`, reevaluate the context so dynamic SDK commands and `.fvm/flutter_sdk` changes cannot use a stale fingerprint.

Create terminals with:

```typescript
window.createTerminal({
  name: "Merry Scripts",
  cwd: this.workspaceRoot,
  env: info.toolchain.environment,
});
```

Reuse only a non-busy tracked terminal whose saved fingerprint matches the fresh context.
Format the absolute launcher, literal `run`, and script path as separate shell words for the detected platform shell.
For install, create `"Merry Install"` with the same `cwd` and environment and send the absolute Dart executable plus `pub global activate merry`.
When shell integration emits completion for that terminal, call `refresh()`.
When completion cannot be observed, show a `"Refresh detection"` action and remove the fixed five-second timer.
Map every `ToolchainResolution` and `CliDetectionResult` failure to the specific messages in the design without dumping the full environment.

- [ ] **Step 4: Replace global execution state in `extension.ts`**

Remove `terminal`, `terminalBusy`, `activeCli`, `statusBar`, `runInTerminal()`, detector/install message functions, and their listeners from `extension.ts`.
After loading `MerryScriptService`, create and initialize:

```typescript
const executionService = new MerryExecutionService(
  context,
  workspaceRoot,
);
await executionService.initialize();
```

Construct `MerryTaskProvider` with `workspaceRoot`, `() => executionService.currentCliInfo`, and `executionService.onDidChangeCliInfo`.
Route commands:

```typescript
commands.registerCommand(Commands.installCli, () =>
  executionService.installMerry(),
);

commands.registerCommand(Commands.runScript, (item: ScriptItem) => {
  if (!item || item.node.isGroup) return;
  return executionService.runScript(item.node.fullPath);
});

commands.registerCommand(Commands.refresh, async () => {
  provider.refresh();
  await executionService.refresh();
});
```

Push `executionService` before providers that subscribe to it so LIFO disposal remains safe.
Keep tree creation, script service, CodeLens, open-source behavior, and command IDs unchanged.

- [ ] **Step 5: Add integration assertions**

Extend `src/test/integration.test.ts` to assert existing command IDs remain registered in trusted mode and that refresh still reloads the provider.
Use the test dependency seam for lifecycle behavior; do not require a real globally installed CLI in the Extension Development Host.
Add a test that activates in the current trusted fixture and verifies task provisioning remains deterministic when CLI context is absent.

- [ ] **Step 6: Run focused and integration tests**

Run:

```bash
pnpm run compile-tests
pnpm run test -- --grep "MerryExecutionService|Merry extension integration"
```

Expected: formatter, trust, refresh, context invalidation, command registration, and provider behavior pass.

- [ ] **Step 7: Commit the execution lifecycle**

```bash
git add src/merry-execution-service.ts src/test/merry-execution-service.test.ts src/extension.ts src/test/integration.test.ts
git commit -m "feat: share Merry execution context"
```

---

### Task 5: Expose Settings and Update Architecture Documentation

**Files:**

- Modify: `package.json`
- Modify: `CLAUDE.md`

**Interfaces:**

- Consumes: the configuration keys read by `MerryExecutionService`.
- Produces: user-editable settings and an accurate architecture flow.

- [ ] **Step 1: Add manifest assertions before the settings**

Add an integration test that reads the extension manifest and asserts:

```typescript
const properties =
  extension.packageJSON.contributes.configuration.properties;
assert.strictEqual(properties["merry.dartSdkPath"].type, "string");
assert.strictEqual(properties["merry.dartSdkPath"].scope, "window");
assert.strictEqual(properties["merry.pubCachePath"].type, "string");
assert.strictEqual(properties["merry.pubCachePath"].scope, "window");
```

Run:

```bash
pnpm run compile-tests && pnpm run test -- --grep "environment settings"
```

Expected: failure because both properties are absent.

- [ ] **Step 2: Declare the two settings**

Add under `contributes.configuration.properties`:

```json
"merry.dartSdkPath": {
  "type": "string",
  "default": "",
  "scope": "window",
  "description": "Dart or Flutter SDK root used for Merry detection and execution. Supports ~, ${workspaceFolder}, and ${env:NAME}."
},
"merry.pubCachePath": {
  "type": "string",
  "default": "",
  "scope": "window",
  "description": "Pub cache root used for Merry detection and execution. Supports ~, ${workspaceFolder}, and ${env:NAME}."
}
```

Do not edit dependencies or run `pnpm install`.

- [ ] **Step 3: Update the architecture flow**

In `CLAUDE.md`, replace the bare `dart pub global list`/`~/.pub-cache` detector flow with:

```text
trusted workspace
  -> resolve SDK: merry setting > Dart Code selection > FVM > environment/PATH
  -> resolve PUB_CACHE: merry setting > environment > ~/.pub-cache
  -> detect with absolute Dart + resolved environment
  -> require absolute <PUB_CACHE>/bin/merry|derry launcher
  -> share one context with Explorer terminal, VS Code Tasks, and installation
```

Document that explicit/inherited inaccessible cache paths are blocking and that untrusted workspaces render scripts without executing tools.
Do not duplicate the full design specification.

- [ ] **Step 4: Run the full automated gate**

Run:

```bash
pnpm run check-types
pnpm run lint
pnpm run compile
pnpm run test
```

Expected: all commands exit 0.

- [ ] **Step 5: Run the TypeScript no-excuse and size audit**

Run:

```bash
bun /Users/dongminyu/.codex/plugins/cache/sisyphuslabs/omo/4.19.0/skills/programming/scripts/typescript/check-no-excuse-rules.ts src/toolchain-environment.ts src/cli-detector.ts src/merry-execution-service.ts src/merry-task-provider.ts src/extension.ts src/test/toolchain-environment.test.ts src/test/cli-detector.test.ts src/test/merry-execution-service.test.ts src/test/merry-task-provider.test.ts src/test/integration.test.ts
awk '!/^[[:space:]]*$/ && !/^[[:space:]]*\/\//' src/toolchain-environment.ts src/merry-execution-service.ts src/extension.ts
```

Expected: no forbidden TypeScript escape hatch and no modified runtime file above 250 non-blank, non-comment lines.
If `extension.ts` remains above 250 lines, move only the new execution/configuration responsibility into `MerryExecutionService`; do not refactor unrelated tree or CodeLens logic.

- [ ] **Step 6: Perform the manual QA gate**

In one Extension Development Host session at a time:

1. Open a Flutter fixture whose `.fvm/flutter_sdk` points to a valid SDK and whose configured Pub cache contains Merry.
2. Run one Explorer script that invokes both bare `flutter` and bare `dart`; record `which flutter`, `which dart`, and the selected cache path from that script's output.
3. Run the same script from `Tasks: Run Task` and confirm the three paths match Explorer output.
4. Open a standalone Dart fixture with `dart.sdkPath` and confirm the detected Dart path.
5. Set both Merry overrides to external-volume paths and confirm detection and execution without globally adding the cache `bin` to `PATH`.
6. Set an invalid explicit cache path and confirm a blocking diagnostic with no fallback.
7. Open the fixture untrusted and confirm scripts render while no SDK-selection, Dart, Merry, or Derry process starts.

Expected: every scenario matches the design acceptance criteria.
Save terminal output or screenshots as local verification evidence; do not commit those artifacts unless requested.

- [ ] **Step 7: Commit settings and documentation**

```bash
git add package.json CLAUDE.md
git commit -m "docs: document Merry environment resolution"
```

---

## Final Verification

- [ ] Confirm the implementation diff contains no dependency or lockfile change.
- [ ] Confirm `git diff --check` exits 0.
- [ ] Confirm `git status --short` contains only expected implementation paths.
- [ ] Confirm the current full commit SHA is the SHA tested by the final automated gate and manual QA.
- [ ] Confirm the resolved Dart executable, Pub cache, launcher, and `PATH` fingerprint are identical across detection, Explorer, Tasks, and installation.
- [ ] Confirm no bare `dart`, `merry`, or `derry` execution remains in runtime files after resolution.
- [ ] Confirm the manual external-cache scenario passed before claiming completion.
