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
    // Note: reload() is NOT called here — call load() from activate()
  }

  /** Initial load entry point. Called once from activate() and awaited. */
  async load(): Promise<void> {
    await this.reload();
  }

  refresh(): void {
    this.reload();
  }

  async reload(): Promise<void> {
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

      if (result.scriptsFilePath !== pubspecPath) {
        const dir = path.dirname(result.scriptsFilePath);
        const base = path.basename(result.scriptsFilePath);
        this.externalFileWatcher = workspace.createFileSystemWatcher(
          new RelativePattern(dir, base),
        );
        const onExternalChange = () => this.reload();
        this.externalFileWatcher.onDidChange(
          onExternalChange,
          this,
          this.disposables,
        );
        this.externalFileWatcher.onDidCreate(
          onExternalChange,
          this,
          this.disposables,
        );
        this.externalFileWatcher.onDidDelete(
          onExternalChange,
          this,
          this.disposables,
        );
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

  getNodes(): ScriptNode[] {
    return this.nodes;
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
