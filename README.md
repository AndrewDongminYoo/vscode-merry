# Merry Scripts

Run `merry` and `derry` scripts directly from VS Code.

Merry Scripts turns your Dart or Flutter script definitions into a browsable UI inside the Explorer, so you can discover, inspect, and run scripts without bouncing between YAML files and terminals.

- Browse scripts in a dedicated Explorer view
- Run scripts with one click
- Use CodeLens directly in `pubspec.yaml`, `merry.yaml`, or `derry.yaml`
- Keep nested groups, hooks, and task workflows visible inside VS Code

![Explorer overview](assets/readme/01-explorer-overview.png)

The Explorer view is the core UX: it surfaces top-level scripts, nested groups such as `build > aab / ipa / apk`, and hook scripts like `pretest` and `posttest` in a way that is much easier to scan than raw YAML.

## Quick start

1. Install the CLI:

```bash
dart pub global activate merry
```

2. Install the VS Code extension.
3. Add scripts to `pubspec.yaml`, or point `scripts:` to `merry.yaml` / `derry.yaml`.
4. Open the project in VS Code.
5. Expand **Merry Scripts** in the Explorer and run any script.

Example `pubspec.yaml`:

```yaml
name: example_app
description: "Awesome Flutter App"

# https://pub.dev/packages/merry
scripts: merry.yaml
version: 1.0.0+1

environment:
  sdk: ^3.11.4
```

Example `merry.yaml`:

```yaml
pretest:
  (description): Clean old coverage output
  (scripts): rm -rf coverage

test:
  (description): Run Flutter tests with coverage
  (scripts): flutter test --coverage

build:
  apk:
    (description): Build Android APK
    (scripts): flutter build apk --release
```

If you already use `derry`, the extension can detect and run it too. When both CLIs are installed, `merry` is preferred.

## Screenshots

### YAML source with CodeLens actions

![YAML source with CodeLens actions](assets/readme/02-codelens-in-yaml.png)

Run scripts straight from the source file without switching back to the Explorer.

### Terminal reuse prompt

![Terminal reuse prompt](assets/readme/03-terminal-reuse-quickpick.png)

When `merry.reuseTerminal` is set to `ask`, the extension lets you decide whether to reuse the current terminal or open a new one.

### Missing CLI guidance

![Missing CLI guidance](assets/readme/04-cli-missing-statusbar.png)

If neither `merry` nor `derry` is installed, the extension shows a warning and gives you a direct path to install the CLI.

### VS Code Tasks integration

![VS Code Tasks integration](assets/readme/05-vscode-tasks-integration.png)

Runnable scripts can also participate in normal VS Code task workflows.

## Features

### Script discovery

The extension activates in workspaces that contain:

- `pubspec.yaml`
- `merry.yaml`
- `derry.yaml`

It supports both common layouts:

1. inline `scripts:` inside `pubspec.yaml`
2. `scripts: merry.yaml` or `scripts: derry.yaml` pointing to an external file

### Explorer-based browsing

Scripts are rendered in a dedicated **Merry Scripts** view in the Explorer.

- runnable leaf scripts use a play icon
- nested script maps become collapsible groups
- hook scripts such as `pretest` and `posttest` get distinct hook styling
- script items show their description or first command inline
- tooltips include the full script path, commands, and working directory when available

### One-click execution

You can run scripts by:

- clicking the script item directly
- using the script item's context menu
- using the `Run Script` command

The extension runs scripts in the integrated terminal with:

```bash
merry run <script path>
```

Nested script paths stay space-delimited, so a structure like this:

```yaml
build:
  aab:
    (scripts): flutter build appbundle --release
```

becomes:

```bash
merry run build aab
```

### Hooks and platform-dispatch nodes

- `preX` / `postX` scripts are recognized as hooks when the matching base script exists.
- platform-dispatch definitions such as `(linux)`, `(macos)`, or `(windows)` are treated as runnable leaf nodes and surfaced with CodeLens support.

### CodeLens in YAML files

When you open the script source file, the extension adds CodeLens actions such as:

- `Run: test`
- `Run: build aab`
- `Run: firebase config prod`

This works for:

- `pubspec.yaml`
- `merry.yaml`
- `derry.yaml`
- external YAML files referenced from `pubspec.yaml`

### VS Code Tasks integration

The extension contributes a `merry` task type so runnable scripts can participate in normal VS Code task workflows.

- leaf scripts become tasks
- build-like scripts are grouped as **Build** tasks
- test hooks and test scripts are grouped as **Test** tasks
- clean-like scripts are grouped as **Clean** tasks

Example task definition:

```json
{
  "type": "merry",
  "script": "test",
  "group": {
    "kind": "test",
    "isDefault": true
  },
  "problemMatcher": [],
  "label": "merry: test",
  "detail": "Runs all tests in the Flutter project without coverage reporting."
}
```

### Auto-refresh and source awareness

The script tree refreshes when:

- `pubspec.yaml` changes
- the external `merry.yaml` / `derry.yaml` file changes

If the workspace contains `merry.yaml` or `derry.yaml` but `pubspec.yaml` does not link it through `scripts:`, the extension shows a helpful message explaining how to connect it.

### Install guidance when the CLI is missing

If neither `merry` nor `derry` is available, the extension does not try to fake execution.

Instead, it:

- shows a warning in the status bar
- offers an install prompt
- can open a terminal with the install command
- can open the `merry` package page on pub.dev

## Commands

This extension contributes these commands:

- `Merry: Run Script`
- `Merry: Refresh Scripts`
- `Merry: Open Script Source`
- `Merry: Install merry CLI`

## Settings

### `merry.enable`

Enable or disable the extension.

### `merry.reuseTerminal`

Controls what happens when you run another script:

- `never`: always create a new terminal
- `always`: reuse the existing Merry terminal when possible
- `ask`: show a Quick Pick so you can choose each time

## Current scope and limitations

- Multi-root workspace behavior is not finalized yet.
- The extension focuses on discovery and execution, not script editing.
- If the CLI is missing, the extension shows install guidance instead of providing a fallback runner.

## Release notes

See [CHANGELOG.md](./CHANGELOG.md) for release history.
