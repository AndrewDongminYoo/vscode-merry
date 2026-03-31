# AGENTS.md

## Overview

- `src/` contains the extension runtime code plus the colocated `src/test/` suites.
- Keep VS Code API concerns in the provider / extension entrypoint layer. Keep pure parsing and CLI selection logic testable without VS Code boot.

## Structure

- `extension.ts`: activation, command registration, install prompt, terminal execution.
- `cli-detector.ts`: detect `merry` or `derry`; prefer `merry`; resolve `binPath`.
- `merry-parser.ts`: parse `pubspec.yaml` and external script files into `ScriptNode[]`.
- `merry-scripts-provider.ts`: `TreeDataProvider`, async reload, `FileSystemWatcher` management.
- `script-item.ts`: `TreeItem` projection for script/group nodes.
- `test/`: colocated unit and integration suites.

## Where to look

- New command or config work: `extension.ts` and `package.json`
- CLI install / detection behavior: `cli-detector.ts`
- Script metadata, hook detection, nested path rules: `merry-parser.ts`
- Refresh behavior, watcher bugs, tree shape: `merry-scripts-provider.ts`
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
- Do not change public command ids (`vscode-merry.*`) casually; they are manifest-facing API.
