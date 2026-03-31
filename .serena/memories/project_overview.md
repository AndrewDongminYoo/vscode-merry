# vscode-merry overview

- Purpose: VS Code extension `Merry Scripts` that discovers merry/derry scripts in Dart or Flutter workspaces, shows them in the Explorer, and runs them in an integrated terminal.
- Primary runtime flow: activate on `pubspec.yaml` / `merry.yaml` / `derry.yaml`, detect `merry` or `derry`, parse script definitions, build a tree, and run `<cli> run <fullPath>`.
- Product constraint: when no compatible CLI is installed, show install guidance; do not add a fallback script runner.

## Key directories

- `src/`: runtime code.
- `src/test/`: all automated tests; tests intentionally live here instead of a root `test/` directory to fit the current VSIX workflow.
- `test-workspace/`: committed fixture workspace for integration tests.
- `docs/plans/`: implementation notes and planning docs.

## Important modules

- `src/extension.ts`: activation, commands, terminal lifecycle, install prompt.
- `src/cli-detector.ts`: prefer `merry`, fall back to `derry`, support filesystem fallback when `dart` is unavailable.
- `src/merry-parser.ts`: YAML semantics, metadata handling, hook detection, nested `fullPath` generation.
- `src/merry-scripts-provider.ts`: tree provider, reload orchestration, `pubspec.yaml` and external scripts file watching.
- `src/script-item.ts`: tree presentation layer.

## Test layout

- `src/test/integration.test.ts`: extension activation and provider behavior against `test-workspace/`.
- `src/test/merry-parser.test.ts`: parser edge cases and semantic rules.
- `src/test/cli-detector.test.ts`: CLI detection parsing.
- `src/test/extension.test.ts`: still mostly the scaffold sample and low signal.
