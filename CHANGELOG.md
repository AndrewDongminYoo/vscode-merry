# Changelog

All notable changes to the **Merry Scripts** extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-04-01

### Added

- **Scripts TreeView** — displays merry/derry scripts in the VS Code Explorer sidebar with collapsible group nodes and inline ▷ Run buttons.
- **CLI detection** — auto-detects `merry` (preferred) or `derry` via `dart pub global list`; falls back to `~/.pub-cache` when `dart` is not on `PATH`. Shows detected version and binary path on activation.
- **CodeLens provider** — shows `▷ Run: <script>` buttons above each script key when editing `pubspec.yaml`, `merry.yaml`, or `derry.yaml`. Group nodes are excluded (non-runnable). Platform-dispatch scripts show `▷ Run: <script> (platform)`.
- **Platform-dispatch scripts** — maps with only platform meta-keys (`(linux)`, `(macos)`, `(windows)`, `(ios)`, `(android)`, `(web)`) are treated as runnable leaf nodes, not empty groups.
- **Terminal reuse setting** (`merry.reuseTerminal`) — three-way enum: `never` (default), `always`, `ask`. When set to `ask`, a quick-pick dialog prompts each time.
- **Busy terminal detection** — uses VS Code Shell Integration API (`onDidStartTerminalShellExecution` / `onDidEndTerminalShellExecution`) to prevent reusing a terminal that is actively running a command. A new terminal is always opened in that case, regardless of the reuse setting.
- **Empty state messages** — the TreeView shows a contextual message when no scripts are found, and the tree panel message updates live.
- **Unlinked script file notification** — if `merry.yaml` or `derry.yaml` is present in the workspace root but `pubspec.yaml` has no `scripts:` field referencing it, an information message is shown with an "Open pubspec.yaml" action.
- **Status bar warning** — a `$(warning) Merry: CLI not found` status bar item appears whenever the install prompt is triggered (initial activation, running a script without CLI, or the `installCli` command). Clicking it re-shows the install prompt.
- **Install CLI command** (`merry.installCli`) — opens a terminal and runs `dart pub global activate merry`; re-checks for the CLI after 5 seconds and clears the status bar warning on success.
- **File system watchers** — `pubspec.yaml` is always watched; when `scripts:` points to an external file, a second watcher is created dynamically with `RelativePattern` and replaced on each reload.
- **Hook detection** — scripts named `preX` / `postX` where `X` is another script name are displayed with a `$(arrow-right)` icon and `isHook: true`.

### Changed

- Tree registration uses `window.createTreeView` (instead of `registerTreeDataProvider`) to support `treeView.message` and `showCollapseAll`.
- Provider constructor no longer calls `reload()` asynchronously; callers must call `await provider.load()` explicitly, eliminating the empty-tree race condition.
- External `FileSystemWatcher` now uses `RelativePattern` instead of an absolute path string.

[0.1.0]: https://github.com/AndrewDongminYoo/vscode-merry/releases/tag/v0.1.0
