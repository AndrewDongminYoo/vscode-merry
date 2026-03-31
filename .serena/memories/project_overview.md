# vscode-merry overview

- Purpose: VS Code extension `Merry Scripts` that shows merry/derry scripts in the Explorer sidebar and runs them in an integrated terminal.
- Target users: Dart/Flutter projects that define scripts in `pubspec.yaml` and optionally external merry/derry YAML files.
- Main behavior: parse script definitions, render them as a tree, refresh on file changes, and execute `merry run <script path>` or `derry run <script path>`.
- Important constraint: if neither CLI is installed, do not attempt a fallback runner; show an install prompt instead.

## Tech stack

- TypeScript + VS Code Extension API.
- Build: `esbuild` bundles `src/extension.ts` to `dist/extension.js` (CommonJS, Node target).
- Type-checking: `tsc` in strict mode.
- Linting: ESLint v9 with `typescript-eslint`.
- Parsing: `js-yaml`.
- Tests: Mocha-style VS Code integration tests via `@vscode/test-electron` / `vscode-test`.
- Package manager: `pnpm`.
- Host OS for local development: Darwin/macOS.

## Codebase shape

- `src/extension.ts`: activation/deactivation, command registration, terminal execution, install prompt.
- `src/merry-parser.ts`: parses `pubspec.yaml` / referenced scripts file into `ScriptNode[]`.
- `src/merry-scripts-provider.ts`: `TreeDataProvider` plus file watchers and refresh logic.
- `src/script-item.ts`: `TreeItem` wrapper for a script/group node.
- `src/cli-detector.ts`: detects whether `merry` or `derry` is available.
- `test/extension.test.ts`: VS Code test entry; currently only a sample placeholder test.
- `esbuild.js`: build/watch script for extension bundling.
- `package.json`: VS Code contributions, activation events, extension settings, npm scripts.
- `CLAUDE.md`: the most accurate repo-specific guidance; `README.md` is still mostly the default scaffold.

## Functional notes

- Activation events currently include `workspaceContains:pubspec.yaml`, `workspaceContains:merry.yaml`, and `workspaceContains:derry.yaml`.
- The tree view id is `merryScripts` and is contributed to the Explorer container.
- The provider always watches `pubspec.yaml`; when `scripts:` points to an external file, it swaps in a second watcher for that file.
- Nested script paths are space-delimited when executed (`merry run build linux-x64`).
- Hook-style names like `preX` / `postX` are marked as hooks for icon/UX handling.
