# Plan: `vscode-merry` Extension - Phase 1 MVP

## Context

`merry` is a fork of the now-unmaintained `derry`. It manages Dart/Flutter scripts defined in `pubspec.yaml` or in an external YAML file. This VS Code extension should let users see all scripts at a glance in the sidebar and run them with a single click, similar to the npm Scripts extension.

**References:**

- `vscode-npm-scripts` patterns (`TreeDataProvider` + terminal execution)
- `merry` CLI source (YAML parsing rules, nested paths, pre/post hook handling)

---

## Understanding the `merry` YAML Structure (Parsing Essentials)

The `scripts:` value in `pubspec.yaml`:

- **string** -> external file path (load that YAML)
- **Map** -> inline script map

Script value types:

- `string` -> single command
- `List` -> command array
- `Map` with `(scripts)` key -> definition (`(description)`, `(workdir)` supported)
- `Map` without `(scripts)` key -> nested group (recursive)

Nested path delimiter: **space** (`build linux-x64`)  
Reference delimiter: `$` prefix + `:` (for example, `$build:linux-x64`)  
Meta key pattern: `/^\(\w+\)$/` (exclude during parsing)

---

## Files to Implement

### New Files

| File                          | Role                                        |
| ----------------------------- | ------------------------------------------- |
| `src/merryParser.ts`          | Parse YAML and return a `ScriptNode[]` tree |
| `src/scriptItem.ts`           | `vscode.TreeItem` subclass                  |
| `src/merryScriptsProvider.ts` | `TreeDataProvider<ScriptItem>`              |

### Files to Modify

| File               | Change                                           |
| ------------------ | ------------------------------------------------ |
| `package.json`     | Add `contributes` entries and `activationEvents` |
| `src/extension.ts` | Implement `activate`/`deactivate`                |

### Dependencies to Add

```bash
pnpm add js-yaml
pnpm add -D @types/js-yaml
```

---

## Detailed Design

### `src/merryParser.ts`

```typescript
interface ScriptNode {
  label: string; // Display name (last segment)
  fullPath: string; // Full path passed to merry run (space-delimited)
  commands: string[]; // Commands to run (empty for groups)
  description?: string;
  workdir?: string;
  isGroup: boolean; // If true, render as a CollapsibleItem with children
  children: ScriptNode[];
}

// Read pubspec.yaml -> resolve scripts: -> load external file if needed
// parseMerryYaml(uri): Promise<ScriptNode[]>
```

Parsing rules (based on the `merry` source):

- Skip meta keys matching `/^\(\w+\)$/` when creating nodes
- A `Map` without a `(scripts)` key -> nested group (`isGroup = true`, recurse)
- A `Map` with a `(scripts)` key -> definition
- Parse pre/post hook scripts as well, but show them with a separate icon in the UI

### `src/scriptItem.ts`

```typescript
class ScriptItem extends vscode.TreeItem {
  constructor(node: ScriptNode);
  // label: node.label
  // description: commands[0] or node.description (undefined for groups)
  // tooltip: all commands joined with line breaks
  // iconPath: ThemeIcon('run') or ThemeIcon('folder') for groups
  // command: vscode-merry.runScript (leaf nodes only)
  // contextValue: 'script' or 'scriptGroup'
}
```

### `src/merryScriptsProvider.ts`

```typescript
class MerryScriptsProvider implements vscode.TreeDataProvider<ScriptItem> {
  private _onDidChangeTreeData = new EventEmitter<...>()
  onDidChangeTreeData = this._onDidChangeTreeData.event

  constructor(private workspaceRoot: string)

  // FileSystemWatcher: **/pubspec.yaml, **/merry.yaml, **/derry.yaml
  // Also watch external script files dynamically
  // getChildren(): convert top-level ScriptNode values to ScriptItem values
  // refresh(): _onDidChangeTreeData.fire(undefined)
}
```

### `package.json` Changes

**activationEvents:**

```json
[
  "workspaceContains:pubspec.yaml",
  "workspaceContains:merry.yaml",
  "workspaceContains:derry.yaml"
]
```

**contributes.views:**

```json
{
  "explorer": [
    {
      "id": "merryScripts",
      "name": "Merry Scripts",
      "when": "workspaceContains:pubspec.yaml || workspaceContains:merry.yaml"
    }
  ]
}
```

**contributes.commands:**

- `vscode-merry.runScript` - "Run Script" (TreeItem inline button `$(play)`)
- `vscode-merry.refresh` - "Refresh" (view title button `$(refresh)`)

**contributes.menus:**

- `view/item/context`: "Run Script" context menu for script items
- `view/title`: refresh button

**contributes.configuration:**

- `merry.reuseTerminal`: boolean, default `false`
- `merry.enable`: boolean, default `true`

### `src/extension.ts` Changes

```typescript
export function activate(context: ExtensionContext) {
  const provider = new MerryScriptsProvider(workspace.rootPath);

  context.subscriptions.push(
    window.registerTreeDataProvider("merryScripts", provider),
    commands.registerCommand("vscode-merry.runScript", (item: ScriptItem) => {
      // merry run <fullPath>  (space-delimited nested path)
      // Reuse an existing terminal or create a new one,
      // depending on the merry.reuseTerminal setting
    }),
    commands.registerCommand("vscode-merry.refresh", () => provider.refresh()),
  );
}
```

---

## Execution Flow

```text
Detect pubspec.yaml
  -> inspect scripts:
       -> string: load external file + register a FileSystemWatcher for it
       -> Map: parse inline
            -> build ScriptNode tree
                 -> TreeDataProvider -> render in the sidebar

Click ScriptItem (play button or context menu)
  -> vscode.window.createTerminal (or reuse an existing one)
       -> run `merry run <fullPath>`
```

---

## Validation

1. `pnpm run compile` -> build succeeds with no type errors
2. Launch the VS Code Extension Development Host (`F5`)
3. Open a Flutter/Dart project that uses `merry` -> confirm the "Merry Scripts" panel appears in the sidebar
4. Verify expand/collapse behavior for nested scripts such as `build > linux-x64`
5. Click a leaf script -> confirm `merry run <name>` executes in the terminal
6. Save `pubspec.yaml` -> confirm the tree refreshes automatically
7. `pnpm run test` -> confirm the existing Extension Test Suite passes
