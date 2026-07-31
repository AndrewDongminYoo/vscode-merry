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

- `src/extension.ts`: activation, commands, service wiring.
- `src/merry-execution-service.ts`: terminal lifecycle, install prompt, status bar, toolchain refresh.
- `src/toolchain-environment.ts`: Dart SDK and Pub cache resolution feeding detection and execution.
- `src/cli-detector.ts`: prefer `merry`, fall back to `derry`, support filesystem fallback when `dart` is unavailable.
- `src/merry-parser.ts`: YAML semantics, metadata handling, hook detection, nested `fullPath` generation.
- `src/merry-script-service.ts`: reload orchestration, `pubspec.yaml` and external scripts file watching.
- `src/merry-scripts-provider.ts`: tree provider over the script service.
- `src/merry-task-provider.ts`: VS Code Tasks integration.
- `src/merry-codelens-provider.ts`: run lenses in the scripts YAML file.
- `src/script-item.ts`: tree presentation layer.

## Test layout

- `src/test/integration.test.ts`: extension activation and provider behavior against `test-workspace/`.
- `src/test/merry-parser.test.ts`: parser edge cases and semantic rules.
- `src/test/cli-detector.test.ts`: CLI detection parsing.
- `src/test/toolchain-environment.test.ts`: SDK and Pub cache resolution.
- `src/test/merry-execution-service.test.ts`, `merry-task-provider.test.ts`, `merry-script-service.test.ts`, `merry-codelens-provider.test.ts`: the matching service and provider suites.
- `src/test/extension.test.ts`: still mostly the scaffold sample and low signal.
