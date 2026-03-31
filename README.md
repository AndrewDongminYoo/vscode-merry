# Merry Scripts

Run `merry` / `derry` scripts from the VS Code Explorer with one click.

## Features

- **Explorer view for scripts**
  - Automatically discovers scripts from `pubspec.yaml`, `merry.yaml`, or `derry.yaml`.
  - Supports inline `scripts:` objects and external YAML script files.
- **Run from tree item or context menu**
  - Click a script node (or use `Run Script`) to execute it in the integrated terminal.
- **Nested script groups and hooks**
  - Nested script objects are shown as collapsible groups.
  - `pre-` / `post-` hooks are rendered with dedicated icon styling.
- **Auto refresh on file changes**
  - Script tree updates when script definition files change.
- **CLI install guidance**
  - If neither `merry` nor `derry` is detected, a warning status bar item appears and opens install guidance.

## Requirements

- A Dart/Flutter workspace containing one of:
  - `pubspec.yaml`
  - `merry.yaml`
  - `derry.yaml`
- Install at least one CLI globally:

```bash
dart pub global activate merry
```

`merry` is preferred when both `merry` and `derry` are installed.

## Extension Settings

This extension contributes the following settings:

- `vscode-merry.enable`
  - Enable or disable the extension.
- `vscode-merry.reuseTerminal`
  - Reuse an existing "Merry Scripts" terminal instead of creating a new terminal per run.

## Known Issues

- Multi-root workspace behavior is not finalized yet.
- Marketplace publishing workflow depends on a valid VS Code Marketplace publisher and token configuration.

## Release Notes

See [CHANGELOG.md](./CHANGELOG.md) for release history.
