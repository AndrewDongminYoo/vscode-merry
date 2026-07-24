# Dart and Pub Environment Resolution Design

## Status

Approved design as of 2026-07-23.

## Problem

The extension currently detects a globally activated `merry` or `derry` package by running `dart pub global list` with the extension host environment.
Its filesystem fallback reads `process.env.PUB_CACHE` or `~/.pub-cache`, but terminal and task execution discard the detected binary path and invoke only `merry` or `derry` by name.
This makes detection and execution depend on different environments.
It fails for common setups where VS Code does not inherit the login shell environment, Flutter or Dart is selected per workspace, FVM provides the Flutter SDK, or the Pub cache is outside the home directory.

Flutter's pub implementation treats `PUB_CACHE` as the console environment key that selects the cache directory.
The extension must therefore resolve and preserve `PUB_CACHE`; it must not infer that every Flutter SDK stores its cache under `$FLUTTER_ROOT/.pub-cache`.

## Goals

- Resolve one immutable execution environment for the active workspace.
- Support Flutter workspaces, FVM workspaces, standalone Dart workspaces, inherited toolchains, and explicitly configured SDK/cache paths.
- Use the same Dart executable, `PUB_CACHE`, CLI binary, and `PATH` ordering for detection, Explorer execution, VS Code Tasks, and CLI installation.
- Preserve the existing preference for `merry` over `derry`.
- Preserve the existing install-prompt-only behavior when neither CLI is available.
- Produce actionable diagnostics that identify the failed resolution layer without exposing the user's full environment.
- Never execute a resolved SDK, CLI, or SDK-selection command until VS Code trusts the workspace.
- Add no runtime dependency.

## Non-goals

- Installing or managing Flutter, Dart, FVM, mise, asdf, or direnv.
- Reimplementing Dart Code's complete SDK locator.
- Executing Merry through a hidden fallback runner when its global executable is unavailable.
- Supporting a per-script toolchain or Pub cache.
- Changing public command IDs, script parsing, nested script path semantics, or terminal reuse semantics.
- Reading private state from the Dart or Flutter VS Code extensions.

## Selected Approach

Introduce a small `ToolchainEnvironment` resolver and make all detection and execution consumers use its result.
The result contains the selected Dart executable, optional Flutter root, resolved Pub cache, ordered `PATH`, and the source of each resolved value.
CLI detection adds the selected `merry` or `derry` package and its absolute launcher path to that result.

This is preferred over only prepending paths because an absolute Dart executable and CLI launcher eliminate ambiguity when multiple SDKs or Pub caches are present.
It is preferred over wrapping every command with `fvm` because FVM already exposes a selected SDK at `.fvm/flutter_sdk`, and direct SDK execution avoids wrapper availability and shell quoting differences.

## Configuration Surface

Add two optional settings:

| Setting | Meaning |
| --- | --- |
| `merry.dartSdkPath` | Absolute or workspace-relative path to a standalone Dart SDK or Flutter SDK root. |
| `merry.pubCachePath` | Absolute or workspace-relative path to the Pub cache root. |

Both settings accept `~`, `${workspaceFolder}`, and `${env:NAME}` substitutions.
An unresolved environment substitution makes that configured value invalid and produces a diagnostic; it does not silently fall through.
Relative paths resolve from the first workspace folder because the extension currently operates on that folder.
Workspace-relative paths and workspace-scoped settings are inert until VS Code trusts the workspace.

`merry.dartSdkPath` accepts either SDK shape:

- Flutter root: `<root>/bin/cache/dart-sdk/bin/dart`
- Standalone Dart root: `<root>/bin/dart`

The setting does not accept a direct path to the `dart` executable.
One path shape keeps validation and error messages deterministic.

`merry.pubCachePath` must identify a directory that either exists or has an existing parent when used by the install command.
Detection treats a missing cache directory as empty rather than creating it.

## Resolution Order

### Dart executable

Resolve the first valid candidate:

1. `merry.dartSdkPath`.
2. For a Flutter workspace, the workspace or user value of `dart.flutterSdkPath`.
3. For a Flutter workspace, the result of `dart.getFlutterSdkCommand`.
4. For a Flutter workspace, `<workspace>/.fvm/flutter_sdk`.
5. For a standalone Dart workspace, the workspace or user value of `dart.sdkPath`.
6. For a standalone Dart workspace, the result of `dart.getDartSdkCommand`.
7. `FLUTTER_ROOT` from the extension host environment.
8. The first valid `dart` executable found on the inherited `PATH`.

A workspace is a Flutter workspace when its `pubspec.yaml` has a `flutter` SDK dependency.
Otherwise it is treated as a standalone Dart workspace.
The resolver does not use `dart.flutterSdkPaths` or `dart.sdkPaths`; those settings enumerate SDK-switching candidates and do not identify the selected SDK.
Command-based Dart Code settings are executed only in a trusted workspace.
Their commands must exit successfully and print exactly one SDK root path to standard output.
Failure is recorded for diagnostics and falls through like other implicit candidates.

For a Flutter workspace, the Dart executable bundled with the selected Flutter SDK wins over a separately configured standalone Dart SDK.
For a standalone Dart workspace, `dart.sdkPath` wins, while an inherited Flutter SDK may still supply Dart only through `PATH`.

Every candidate is validated by its expected filesystem shape before selection.
An invalid explicit `merry.dartSdkPath` is a configuration error and stops resolution.
An invalid Dart Code setting or implicit candidate is recorded for diagnostics and falls through to the next candidate.

### Pub cache

Resolve the first configured value:

1. `merry.pubCachePath`.
2. `PUB_CACHE` from the extension host environment.
3. `<home>/.pub-cache`.

The resolver never derives Pub cache location from the Flutter root.
Users whose cache is `$FLUTTER_ROOT/.pub-cache` can set `merry.pubCachePath` to `${env:FLUTTER_ROOT}/.pub-cache` when `FLUTTER_ROOT` is available to the extension host, or use an absolute/workspace-relative path when it is not.
An explicit or inherited Pub cache is authoritative.
If it is inaccessible, resolution reports that failure instead of silently selecting `~/.pub-cache`.
The default cache may be absent during detection, but its nearest existing parent must be writable before installation.

### Effective environment

Build the child environment from the extension host environment, then set the resolved `PUB_CACHE`.
Set `FLUTTER_ROOT` only when a Flutter root was resolved.
When a Flutter root was resolved, prepend `<flutterRoot>/bin` so both bare `flutter` and `dart` commands launched inside Merry use that SDK.
Otherwise prepend the standalone Dart SDK `bin` directory.
Place `<PUB_CACHE>/bin` after the selected SDK directory and before the inherited `PATH`.
Deduplicate paths with platform-appropriate case sensitivity.
Do not remove unrelated inherited environment variables.

## Data Model

The resolver returns a discriminated result:

```typescript
type ToolchainResolution =
  | {
      readonly kind: "resolved";
      readonly dartExecutable: string;
      readonly flutterRoot?: string;
      readonly pubCache: string;
      readonly environment: Readonly<Record<string, string>>;
      readonly sources: {
        readonly dart: ToolchainSource;
        readonly pubCache: PubCacheSource;
      };
    }
  | {
      readonly kind: "invalid-configuration";
      readonly setting: "merry.dartSdkPath" | "merry.pubCachePath";
      readonly reason: string;
    }
  | {
      readonly kind: "workspace-untrusted";
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

`CliInfo` becomes an execution-ready value containing `cli`, optional package version, and an absolute launcher path.
Callers must not reconstruct a command from the CLI name.

The resolver remains independent of the VS Code API.
An adapter in the extension layer reads workspace configuration and process environment into a typed input.
This keeps path resolution and precedence testable with temporary directories.

## Detection Flow

1. Stop before process execution when the workspace is untrusted.
2. Resolve the toolchain and Pub environment.
3. Run the selected absolute Dart executable with `pub global list` and the resolved environment.
4. Parse output with the existing exact package-name matching and `merry`-first preference.
5. For the selected package, require the platform-specific launcher under `<PUB_CACHE>/bin`.
6. If the Dart command fails, inspect `<PUB_CACHE>/global_packages` using the same `merry`-first preference.
7. Return an execution-ready `CliInfo` only when the corresponding launcher exists.

The filesystem fallback remains a detection fallback, not an alternative script runner.
If the package registration exists but its launcher is missing, the UI reports the broken global activation and offers installation rather than invoking a different command.

Detection should rerun when VS Code grants workspace trust or when `merry.dartSdkPath`, `merry.pubCachePath`, `dart.flutterSdkPath`, `dart.getFlutterSdkCommand`, `dart.sdkPath`, or `dart.getDartSdkCommand` changes.
Revoking trust requires a window reload, so activation performs the same trust gate before recreating any context.
Command-based SDK selection is reevaluated before detection and before an execution surface consumes a cached context.
The `.fvm/flutter_sdk` link is reevaluated on manual refresh and before execution.
The task provider cache must be invalidated when the resolved CLI context changes.

## Execution Surfaces

### Explorer terminal

Create the terminal with the workspace root as `cwd` and the resolved environment in `TerminalOptions.env`.
Send a shell-escaped command using the absolute CLI launcher and `run` arguments.
Terminal reuse is allowed only when the existing terminal was created for the same resolution fingerprint: Dart executable, Pub cache, CLI launcher, and effective workspace root.
A configuration or toolchain change therefore creates a new terminal.

### VS Code Tasks

Construct `ShellExecution` from the absolute CLI launcher and explicit argument array.
Represent every workspace-derived argument with `ShellQuotedString` and strong quoting, including the script path.
Set the task execution environment and workspace root through `ShellExecutionOptions`.
Generated tasks depend on a resolved CLI context; when resolution is missing, the provider returns no runnable tasks and the existing install/status guidance remains the user-facing recovery path.

### Install command

Invoke the selected absolute Dart executable with `pub global activate merry` using the resolved environment.
After completion, rerun normal detection rather than waiting a fixed duration.
The design should use VS Code terminal shell-execution completion when available.
If completion cannot be observed, retain a bounded manual refresh action instead of guessing success after five seconds.

## Error Handling and Diagnostics

Invalid explicit Merry settings are blocking because silently selecting another SDK or cache would violate user intent.
Invalid Dart Code settings and implicit candidates are non-blocking because another documented source may be valid.
An untrusted workspace blocks detection, installation, Explorer execution, tasks, and command-based SDK selection while leaving script discovery and rendering available.

User-visible messages distinguish:

- Dart SDK not found.
- Explicit Merry setting invalid.
- Pub cache inaccessible.
- Workspace not trusted for tool execution.
- Merry or Derry not globally activated in the resolved cache.
- Global package registered but launcher missing.

Messages include the selected source label and relevant path, but never dump `PATH` or the full child environment.
The detected status message includes the CLI launcher and the source of the Dart SDK and Pub cache so users can diagnose mismatches.

## Security and Portability

- Use `execFile` with an absolute executable and static argument array for detection.
- Gate every process execution and workspace-derived executable path on `workspace.isTrusted`.
- Use `ShellExecution` with strongly quoted `ShellQuotedString` values for workspace-derived task arguments.
- Apply platform-specific launcher names, path delimiters, executable suffixes, and case sensitivity.
- Shell-escape the Explorer terminal command for POSIX shells, PowerShell, and `cmd.exe`; do not concatenate raw script paths.
- Validate substitutions before filesystem access.
- Execute `dart.getDartSdkCommand` and `dart.getFlutterSdkCommand` only as intentional, public Dart Code configuration in a trusted workspace.
- Do not log the full environment.

## Files Expected to Change During Implementation

| Action | Path | Responsibility |
| --- | --- | --- |
| Create | `src/toolchain-environment.ts` | Pure SDK, Pub cache, substitution, and environment resolution. |
| Create | `src/test/toolchain-environment.test.ts` | Resolution precedence and platform path tests. |
| Modify | `src/cli-detector.ts` | Detect using a resolved environment and return an absolute launcher. |
| Modify | `src/test/cli-detector.test.ts` | Detection and fallback regression coverage. |
| Modify | `src/extension.ts` | Read configuration, own resolution lifecycle, and run/install with the resolved context. |
| Modify | `src/merry-task-provider.ts` | Build tasks from the resolved execution context. |
| Modify | `src/test/merry-task-provider.test.ts` | Assert executable, arguments, environment, and cache invalidation. |
| Modify | `src/test/integration.test.ts` | Verify configuration-change wiring without relying on installed SDKs. |
| Modify | `package.json` | Declare the two optional Merry settings. |
| Modify | `CLAUDE.md` | Replace the obsolete detector/execution flow with the resolved environment flow. |

The implementation is expected to touch ten files.
Before implementation, the plan must identify whether extension activation wiring can be kept below this scope.
No dependency manifest change is expected.

## Test Strategy

### Unit tests

Use temporary directories to construct distinct valid Flutter SDK, standalone Dart SDK, FVM, Pub cache, and CLI launcher shapes.
Each precedence test gives every candidate a different path so a fallback cannot accidentally satisfy the assertion.

Required cases:

- Explicit Merry SDK wins over Dart Code settings, FVM, environment, and `PATH`.
- Flutter workspace uses `dart.flutterSdkPath` before FVM.
- FVM supplies bundled Dart when no selected Flutter setting exists.
- Command-based Dart Code SDK selection supplies Flutter or Dart only in a trusted workspace.
- Standalone workspace uses `dart.sdkPath` and does not select FVM.
- `FLUTTER_ROOT` and inherited `PATH` remain valid fallbacks.
- Explicit, inherited, and default Pub cache precedence.
- An inaccessible explicit or inherited Pub cache produces `pub-cache-unavailable` without fallback.
- `$FLUTTER_ROOT/.pub-cache` is used only when explicitly resolved through `merry.pubCachePath`.
- Invalid explicit setting blocks fallback.
- Invalid implicit setting falls through and remains diagnosable.
- Selected Flutter root precedes inherited toolchains in `PATH`.
- `merry` remains preferred over `derry`.
- A package registration without a launcher is not executable.
- Untrusted workspaces never execute SDK selection, Dart, Merry, or Derry.
- Windows and POSIX launcher/path behavior.
- Shell metacharacters in script paths remain one strongly quoted task argument.

### Integration tests

- Activation with a synthetic resolved context registers existing commands and tasks.
- A configuration change invalidates detection and generated tasks.
- Granting workspace trust enables a fresh resolution; activation after trust revocation creates no execution context.
- Explorer and task execution receive the same executable and Pub environment.
- Tests do not depend on globally installed Dart, Flutter, Merry, Derry, or FVM.

### Manual QA

Validate these real surfaces in an Extension Development Host:

1. A Flutter workspace with `.fvm/flutter_sdk` and a Merry executable in the selected Pub cache.
2. A standalone Dart workspace with `dart.sdkPath`.
3. A workspace with `merry.dartSdkPath` and `merry.pubCachePath` pointing to an external volume.
4. A workspace with an invalid explicit path, confirming the diagnostic and absence of silent fallback.
5. An untrusted workspace, confirming scripts render but no SDK or CLI process starts.
6. Explorer execution and `Tasks: Run Task`, confirming both report and use the same SDK/cache context.
7. A Merry script that invokes bare `flutter` and `dart`, confirming both resolve inside the selected FVM/Flutter SDK.

## Acceptance Criteria

- One resolved context supplies detection, Explorer execution, tasks, and installation.
- No execution surface invokes a bare `dart`, `merry`, or `derry` command after resolution.
- The approved resolution order is deterministic and covered by tests with distinct candidate values.
- FVM and standalone Dart workspaces select the intended Dart executable.
- An external Pub cache works without adding its `bin` directory to the user's global `PATH`.
- Invalid explicit settings do not silently fall back.
- Untrusted workspaces do not execute workspace-selected binaries or commands.
- Bare `flutter` and `dart` commands launched by Merry resolve to the selected Flutter SDK.
- Workspace-derived task arguments use strong shell quoting.
- Existing command IDs, script semantics, CLI preference, and install-only missing-CLI policy remain unchanged.
- `pnpm run check-types`, `pnpm run lint`, `pnpm run compile`, and `pnpm run test` pass.
- Manual QA observes successful Explorer and task execution in the external-cache scenario.

## Adversarial Review

An independent adversarial review completed on 2026-07-23 and identified five concrete defects in the first draft.
The reviewed defects and their resolutions are:

1. Workspace-provided SDKs could execute before trust was granted.
   Resolution: all SDK selection commands and resolved tool execution are gated on workspace trust.
2. Task arguments lacked guaranteed strong shell quoting.
   Resolution: every workspace-derived task argument uses strongly quoted `ShellQuotedString`.
3. A selected Flutter/FVM SDK did not put its `flutter` command first on `PATH`.
   Resolution: `<flutterRoot>/bin` precedes Pub cache and inherited paths.
4. Dart Code command-based SDK selection was not followed.
   Resolution: trusted workspaces support `dart.getFlutterSdkCommand` and `dart.getDartSdkCommand` with deterministic precedence and reevaluation.
5. An inaccessible Pub cache could not be represented by the resolution type.
   Resolution: `pub-cache-unavailable` records the source, path, and failure reason without silent fallback.

All five findings are reflected in the architecture, data model, security rules, and required tests above.

## Sources

- User-provided Flutter source selection from `packages/flutter_tools/lib/src/dart/pub.dart`, lines 34-35, defining `PUB_CACHE` as the console environment key used by pub.
- Current repository files `src/cli-detector.ts`, `src/extension.ts`, `src/merry-task-provider.ts`, `src/test/cli-detector.test.ts`, `package.json`, `AGENTS.md`, `src/AGENTS.md`, `src/test/AGENTS.md`, and `CLAUDE.md`, inspected on 2026-07-23.
- Dart Code documentation, “Settings” and “How Dart-Code locates a Dart/Flutter SDK,” inspected on 2026-07-23.
- Oracle project precedent for personal-account `vscode-merry`, retrieved on 2026-07-23; project-specific FVM and precedence rules were not found and are established by this design.
