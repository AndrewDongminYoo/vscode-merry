# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Purpose

VS Code extension that displays [derry](https://github.com/frencojobs/derry) scripts (a Dart/Flutter script runner) in the sidebar and lets users run them with a single click. See `PLAN.md` for the full phased roadmap.

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

To run a single test suite, use the `@vscode/test-cli` config (`.vscode-test.mjs` if added) or pass `--grep` via mocha options in the test runner.

## Architecture

### Build pipeline

`esbuild.js` bundles `src/extension.ts` → `dist/extension.js` (CJS, Node platform, `vscode` marked external). No Webpack. Production builds are minified; dev builds include source maps.

### Extension entry point

`src/extension.ts` exports `activate(context)` and `deactivate()`. All VS Code contributions (commands, views, settings) are declared in `package.json` under `"contributes"`.

### Planned architecture (see `PLAN.md`)

The extension is in Phase 1 (boilerplate). Upcoming core modules:

- **`pubspec.yaml` parser** — loads `scripts:` from the workspace root; handles both inline object and external file path values
- **`ScriptItem`** — `vscode.TreeItem` subclass representing one derry script
- **`DerryScriptsProvider`** — implements `vscode.TreeDataProvider<ScriptItem>`; fires `_onDidChangeTreeData` on `FileSystemWatcher` events for `**/pubspec.yaml` and the external scripts file
- **Terminal runner** — `vscode.window.createTerminal()` → `derry <name>`; optional reuse via `derry.reuseTerminal` setting

### Testing

Tests live in `src/test/` and run inside an actual VS Code instance via `@vscode/test-electron`. Compiled test output goes to `out/`. The test runner (`vscode-test`) spawns VS Code, loads the extension, and executes Mocha suites.

## Key constraints (from `PLAN.md`)

- No fallback execution when derry CLI is not installed — show an install prompt only.
- No script editing UI in current scope.
- Multi-root workspace support deferred to Phase 3.
