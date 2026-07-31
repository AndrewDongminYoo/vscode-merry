# AGENTS.md

## Overview

- `src/` contains the extension runtime code plus the colocated `src/test/` suites.
- Keep VS Code API concerns in the provider / extension entrypoint layer. Keep pure parsing and CLI selection logic testable without VS Code boot.

## Structure

- `extension.ts`: activation, command registration, service wiring.
- `commands.ts`: `merry.*` command id constants.
- `cli-detector.ts`: detect `merry` or `derry`; prefer `merry`; resolve `launcherPath`.
- `merry-parser.ts`: parse `pubspec.yaml` and external script files into `ScriptNode[]`.
- `merry-script-service.ts`: script state, async reload, `FileSystemWatcher` management.
- `merry-scripts-provider.ts`: `TreeDataProvider` projecting the script service.
- `script-item.ts`: `TreeItem` projection for script/group nodes.
- `merry-codelens-provider.ts`: run lenses inside the resolved scripts YAML file.
- `merry-task-provider.ts`: `TaskProvider` exposing leaf scripts as VS Code tasks.
- `merry-execution-service.ts`: toolchain refresh, terminal execution, install prompt, status bar.
- `shell-command.ts`: per-platform shell selection and argument quoting.
- `toolchain-environment.ts` / `toolchain-paths.ts` / `vscode-toolchain-adapter.ts`: Dart SDK and Pub cache resolution, and the VS Code settings adapter feeding it.
- `test/`: colocated unit and integration suites.

## Where to look

- New command or config work: `extension.ts` and `package.json`
- CLI detection behavior: `cli-detector.ts`
- SDK / Pub cache resolution and install prompts: `toolchain-environment.ts`, `merry-execution-service.ts`
- Terminal execution, quoting, shell choice: `merry-execution-service.ts`, `shell-command.ts`
- Script metadata, hook detection, nested path rules: `merry-parser.ts`
- Refresh behavior, watcher bugs: `merry-script-service.ts`
- Tree shape: `merry-scripts-provider.ts`
- Icons, tooltips, collapsible state: `script-item.ts`

## Conventions

- Preserve `merry` preference when both CLIs are available.
- Preserve the space-delimited nested script path contract: `build android`, not dotted or slashed paths.
- Keep parser logic free of VS Code dependencies so unit tests stay cheap.
- If a change affects reload semantics, verify watcher behavior against external script files as well as inline scripts.

## Anti-patterns

- Do not hardcode `derry` when the code already abstracts over `merry | derry`.
- Do not move parser semantics into UI classes.
- Do not bypass provider refresh/reload flow with one-off tree mutations.
- Do not change public command ids (`merry.*`) casually; they are manifest-facing API.
