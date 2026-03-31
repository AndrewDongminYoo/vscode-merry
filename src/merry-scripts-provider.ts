import * as path from "path";
import {
  type Disposable,
  EventEmitter,
  type FileSystemWatcher,
  RelativePattern,
  type TreeDataProvider,
  type TreeItem,
  workspace,
} from "vscode";

import { parseMerryScripts, type ScriptNode } from "./merry-parser";
import { ScriptItem } from "./script-item";

export class MerryScriptsProvider
  implements TreeDataProvider<ScriptItem>, Disposable
{
  private readonly _onDidChangeTreeData = new EventEmitter<
    ScriptItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private nodes: ScriptNode[] = [];
  private scriptsFilePath: string | null = null;

  private readonly pubspecWatcher: FileSystemWatcher;
  private externalFileWatcher: FileSystemWatcher | null = null;

  private readonly disposables: Disposable[] = [];

  constructor(private readonly workspaceRoot: string) {
    this.pubspecWatcher = workspace.createFileSystemWatcher(
      new RelativePattern(workspaceRoot, "pubspec.yaml"),
    );
    const onPubspecChange = () => this.reload();
    this.pubspecWatcher.onDidChange(onPubspecChange, this, this.disposables);
    this.pubspecWatcher.onDidCreate(onPubspecChange, this, this.disposables);
    this.pubspecWatcher.onDidDelete(onPubspecChange, this, this.disposables);
    this.disposables.push(this.pubspecWatcher);

    this.reload();
  }

  refresh(): void {
    this.reload();
  }

  private async reload(): Promise<void> {
    // Dispose previous external file watcher
    if (this.externalFileWatcher) {
      this.externalFileWatcher.dispose();
      this.externalFileWatcher = null;
    }

    const pubspecPath = path.join(this.workspaceRoot, "pubspec.yaml");
    const result = await parseMerryScripts(pubspecPath);

    if (!result) {
      this.nodes = [];
      this.scriptsFilePath = null;
    } else {
      this.nodes = result.nodes;
      this.scriptsFilePath = result.scriptsFilePath;

      // If scripts are in an external file, watch it too
      if (result.scriptsFilePath !== pubspecPath) {
        this.externalFileWatcher = workspace.createFileSystemWatcher(
          result.scriptsFilePath,
        );
        const onExternalChange = () => this.reload();
        this.externalFileWatcher.onDidChange(onExternalChange);
        this.externalFileWatcher.onDidCreate(onExternalChange);
        this.externalFileWatcher.onDidDelete(onExternalChange);
        this.disposables.push(this.externalFileWatcher);
      }
    }

    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ScriptItem): TreeItem {
    return element;
  }

  getChildren(element?: ScriptItem): ScriptItem[] {
    if (!element) {
      return this.nodes.map((n) => new ScriptItem(n));
    }
    if (element.node.isGroup) {
      return element.node.children.map((n) => new ScriptItem(n));
    }
    return [];
  }

  getScriptsFilePath(): string | null {
    return this.scriptsFilePath;
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
