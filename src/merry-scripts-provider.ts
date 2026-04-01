import * as fs from "fs";
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

/** Candidate script file names that merry/derry conventionally use. */
const SCRIPT_FILE_CANDIDATES = ["merry.yaml", "derry.yaml"];

export class MerryScriptsProvider
  implements TreeDataProvider<ScriptItem>, Disposable
{
  private readonly _onDidChangeTreeData = new EventEmitter<
    ScriptItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private nodes: ScriptNode[] = [];
  private scriptsFilePath: string | null = null;
  private statusMessage: string = "";
  /** Non-null when a script file (merry.yaml/derry.yaml) exists but is not
   *  referenced from pubspec.yaml. Stores the detected filename. */
  private unlinkedScriptFile: string | null = null;

  private readonly pubspecWatcher: FileSystemWatcher;
  private externalFileWatcher: FileSystemWatcher | null = null;
  /** Listeners attached to externalFileWatcher — drained on each reload. */
  private externalListenerDisposables: Disposable[] = [];

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
    for (const d of this.externalListenerDisposables) {
      d.dispose();
    }
    this.externalListenerDisposables = [];

    const pubspecPath = path.join(this.workspaceRoot, "pubspec.yaml");
    const result = await parseMerryScripts(pubspecPath);

    if (!result) {
      this.nodes = [];
      this.scriptsFilePath = null;
      this.unlinkedScriptFile = this.detectUnlinkedScriptFile();
      this.statusMessage = this.unlinkedScriptFile
        ? ""
        : "No merry scripts found. Add a `scripts:` field to pubspec.yaml.";
    } else {
      this.nodes = result.nodes;
      this.scriptsFilePath = result.scriptsFilePath;
      this.unlinkedScriptFile = null;
      this.statusMessage = "";

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
          this.externalListenerDisposables,
        );
        this.externalFileWatcher.onDidCreate(
          onExternalChange,
          this,
          this.externalListenerDisposables,
        );
        this.externalFileWatcher.onDidDelete(
          onExternalChange,
          this,
          this.externalListenerDisposables,
        );
      }
    }

    this._onDidChangeTreeData.fire();
  }

  /**
   * Returns the filename of a script file found in the workspace root that is
   * not yet referenced from pubspec.yaml, or null if none found.
   */
  private detectUnlinkedScriptFile(): string | null {
    for (const candidate of SCRIPT_FILE_CANDIDATES) {
      const filePath = path.join(this.workspaceRoot, candidate);
      if (fs.existsSync(filePath)) {
        return candidate;
      }
    }
    return null;
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

  getStatusMessage(): string {
    return this.statusMessage;
  }

  /** Returns the script filename that is unlinked from pubspec.yaml, or null. */
  getUnlinkedScriptFile(): string | null {
    return this.unlinkedScriptFile;
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
