# Plan: Fix the VS Code Merry Extension UI - TreeView + CodeLens

## Context

The extension currently parses `pubspec.yaml` and external script files such as `merry.yaml` correctly, but nothing appears in the sidebar TreeView. There are two main causes:

1. **Async initialization race condition**: `MerryScriptsProvider` calls `this.reload()` inside its constructor without awaiting it, so `nodes` is still empty when `registerTreeDataProvider` runs. When VS Code calls `getChildren()` for the first time, it receives an empty array. The view only updates later if `onDidChangeTreeData` fires, which leads to a broken initial UX.

2. **Missing feature**: there is no CodeLens support to show an inline run button above each script command when a script file is open in the editor.

There are also two smaller issues:

- `package.json` does not declare the `installCli` command.
- The external file watcher uses an absolute path string as though it were a glob pattern.

---

## What Will Change

### 1. `extension.ts` - Redesign the activation flow

**Current problem:**

```typescript
const provider = new MerryScriptsProvider(workspaceRoot); // async reload() starts inside the constructor
window.registerTreeDataProvider("merryScripts", provider); // nodes is still []
provider.refresh(); // triggers reload() again
```

**Planned change:**

- Remove `reload()` from the `MerryScriptsProvider` constructor.
- Add `await provider.load()` in `activate()` before registering the provider.
- Run CLI detection (`detectMerryCli`) asynchronously so TreeView rendering is not blocked.
- Switch from `window.registerTreeDataProvider` to `window.createTreeView` so the view can be controlled more explicitly.
- Register a CodeLens provider.

```typescript
export async function activate(context: ExtensionContext) {
  const workspaceFolders = workspace.workspaceFolders;
  if (!workspaceFolders?.length) return;

  const workspaceRoot = workspaceFolders[0].uri.fsPath;

  // 1. Create the provider and wait for the initial load to finish.
  const provider = new MerryScriptsProvider(workspaceRoot);
  await provider.load();

  // 2. Register the TreeView after data is available.
  const treeView = window.createTreeView("merryScripts", {
    treeDataProvider: provider,
    showCollapseAll: true,
  });

  // 3. Register the CodeLens provider.
  const codeLensProvider = new MerryCodeLensProvider(provider);
  const docSelector = [
    { language: "yaml", pattern: "**/pubspec.yaml" },
    { language: "yaml", pattern: "**/merry.yaml" },
    { language: "yaml", pattern: "**/derry.yaml" },
  ];
  context.subscriptions.push(
    treeView,
    provider,
    languages.registerCodeLensProvider(docSelector, codeLensProvider),
  );

  // 4. Detect the CLI in the background so TreeView rendering is not blocked.
  detectMerryCli().then((info) => { ... });

  // 5. Register commands...
}
```

### 2. `merry-scripts-provider.ts` - Change the initialization pattern

- The constructor should only set up watchers and must not call `reload()`.
- Add `load(): Promise<void>` as the initial loading entry point that `activate()` can await.
- Replace the external file watcher from `createFileSystemWatcher(string)` to `createFileSystemWatcher(RelativePattern)`.

  ```typescript
  // Before: incorrect absolute-path string usage
  workspace.createFileSystemWatcher(result.scriptsFilePath);

  // After: RelativePattern
  const dir = path.dirname(result.scriptsFilePath);
  const base = path.basename(result.scriptsFilePath);
  workspace.createFileSystemWatcher(new RelativePattern(dir, base));
  ```

- When `reload()` finishes, also trigger a CodeLens refresh event.

### 3. `src/merry-codelens-provider.ts` (new)

Add a new file that implements `vscode.CodeLensProvider`.

- `provideCodeLenses(document)`:
  - If the open file is `pubspec.yaml`, compare it with `provider.getScriptsFilePath()` to determine whether it is the active script source file.
  - If the file is the script source file, iterate over the provider's node list and create a CodeLens for each YAML key position.
  - Each CodeLens uses the title `Run: <scriptName>` and the command `merry.runScript`.

```typescript
export class MerryCodeLensProvider implements CodeLensProvider {
  private readonly _onDidChangeCodeLenses = new EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  constructor(private readonly provider: MerryScriptsProvider) {
    // Refresh CodeLens whenever the tree data changes.
    provider.onDidChangeTreeData(() => this._onDidChangeCodeLenses.fire());
  }

  provideCodeLenses(document: TextDocument): CodeLens[] {
    const scriptsFilePath = this.provider.getScriptsFilePath();
    if (!scriptsFilePath || document.uri.fsPath !== scriptsFilePath) return [];

    const nodes = this.provider.getNodes();
    return this.buildLenses(document, nodes);
  }
}
```

Line lookup strategy:

- Iterate through `document.getText()` line by line.
- Match YAML keys with a pattern such as `/^(\\s*)(key):/`.
- Map each script key to its line number and build the corresponding CodeLens.

### 4. `package.json` - Add the missing declarations

- Add `merry.installCli` to `contributes.commands`.
- Simplify the view `when` clause. `workspaceContains:pubspec.yaml` is sufficient and matches the activation condition.
- Add an `installCli` menu contribution for the Command Palette or another appropriate entry point.

### 5. `merry-scripts-provider.ts` - Expose `getNodes()`

Add `getNodes(): ScriptNode[]` so the CodeLens provider can read the currently parsed node tree.

---

## Files to Modify

| File                             | Action                                                          |
| -------------------------------- | --------------------------------------------------------------- |
| `src/extension.ts`               | Redesign the activation flow and register the CodeLens provider |
| `src/merry-scripts-provider.ts`  | Add `load()`, fix the watcher, and expose `getNodes()`          |
| `src/merry-codelens-provider.ts` | New file for the CodeLens implementation                        |
| `package.json`                   | Declare `installCli` and simplify the view `when` clause        |

---

## Verification

1. Run `pnpm run compile` and confirm the project builds without type errors.
2. Launch the Extension Development Host with `F5` and open `test-workspace`.
3. In the Explorer sidebar, confirm that the **Merry Scripts** section shows the script list immediately.
4. Open `test-workspace/merry.yaml` and confirm that a `Run: <name>` CodeLens appears above each script key.
5. Click a CodeLens and confirm that the terminal runs `merry run <script>`.
6. Run `pnpm run test` and confirm that the existing test suite still passes.
