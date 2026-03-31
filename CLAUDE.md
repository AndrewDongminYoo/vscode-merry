# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

VS Code extension that displays [merry](https://github.com/AndrewDongminYoo/merry) scripts (a maintained fork of derry — a Dart/Flutter script runner) in the sidebar, letting users run them with a single click. Reference extension: [vscode-npm-scripts](https://github.com/microsoft/vscode-npm-scripts).

## Commands

```bash
pnpm install           # install dependencies

pnpm run compile       # type-check + lint + build (dev)
pnpm run package       # type-check + lint + build (production, minified)
pnpm run watch         # parallel watch: esbuild + tsc type-check

pnpm run lint          # eslint src/
pnpm run check-types   # tsc --noEmit

pnpm run test          # compile-tests + compile + lint, then run vscode-test
```

To run tests in Extension Development Host, press `F5` in VS Code.

## Architecture

### Build pipeline

`esbuild.js` bundles `src/extension.ts` → `dist/extension.js` (CJS, Node platform, `vscode` marked external). Production builds are minified; dev builds include source maps.

### Source modules

| File                          | Role                                                           |
| ----------------------------- | -------------------------------------------------------------- |
| `src/extension.ts`            | `activate`/`deactivate`, command registration, terminal runner |
| `src/merryParser.ts`          | YAML parsing → `ScriptNode[]` tree                             |
| `src/scriptItem.ts`           | `vscode.TreeItem` subclass                                     |
| `src/merryScriptsProvider.ts` | `TreeDataProvider<ScriptItem>` with `FileSystemWatcher`        |

### merry YAML parsing rules (critical)

Scripts are read from `pubspec.yaml`:

- `scripts: string` → external file path (load that YAML)
- `scripts: Map` → inline scripts map

Each entry in the scripts map:

- `string` / `List` → leaf script node with commands
- `Map` **with** `(scripts)` key → leaf script with metadata (`(description)`, `(workdir)`)
- `Map` **without** `(scripts)` key → collapsible group node (recurse)
- Keys matching `/^\(\w+\)$/` (e.g. `(variables)`, `(aliases)`) → skip, not script nodes

**Nested path delimiter is space** — `merry run build linux-x64`.

**Hook detection**: `preX` / `postX` where `X` is another script name → `isHook: true` → `$(arrow-right)` icon.

### Data flow

```log
pubspec.yaml  ──parseMerryScripts()──▶  ScriptNode[]
                  (merryParser.ts)           │
                                       ScriptItem[]
                                       (scriptItem.ts)
                                             │
                                    TreeDataProvider
                                  (merryScriptsProvider.ts)
                                             │
                                        VS Code sidebar
                                             │
                              vscode-merry.runScript command
                                             │
                              merry run <fullPath>  ← integrated terminal
```

### FileSystemWatcher strategy

`MerryScriptsProvider` always watches `pubspec.yaml`. When `scripts:` points to an external file, a second watcher is created dynamically and replaced on each reload.

### Extension entry point

All VS Code contributions (commands, views, settings) are declared in `package.json` under `"contributes"`. The view ID `merryScripts` is registered in the `explorer` container.

### Testing

Tests live in `src/test/` and run inside an actual VS Code instance via `@vscode/test-electron`. Compiled test output goes to `out/`. The test runner (`vscode-test`) spawns VS Code, loads the extension, and executes Mocha suites.

## Key constraints (from `PLAN.md`)

- No fallback execution when merry CLI is not installed — show an install prompt only (Phase 2).
- No script editing UI in current scope.
- Multi-root workspace support deferred to Phase 3.
