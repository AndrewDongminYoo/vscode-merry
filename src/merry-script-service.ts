import * as fs from "fs";
import * as path from "path";
import {
  type Disposable,
  type Event,
  EventEmitter,
  type FileSystemWatcher,
  RelativePattern,
  workspace,
} from "vscode";

import { parseMerryScripts, type ScriptNode } from "./merry-parser";

const SCRIPT_FILE_CANDIDATES = ["merry.yaml", "derry.yaml"];

export class MerryScriptService implements Disposable {
  private readonly _onDidChangeScripts = new EventEmitter<void>();
  readonly onDidChangeScripts: Event<void> = this._onDidChangeScripts.event;

  private nodes: ScriptNode[] = [];
  private scriptsFilePath: string | null = null;
  private statusMessage: string = "";
  private unlinkedScriptFile: string | null = null;

  private readonly pubspecWatcher: FileSystemWatcher;
  private externalFileWatcher: FileSystemWatcher | null = null;
  private externalListenerDisposables: Disposable[] = [];
  private readonly disposables: Disposable[] = [];

  constructor(private readonly workspaceRoot: string) {
    this.pubspecWatcher = workspace.createFileSystemWatcher(
      new RelativePattern(workspaceRoot, "pubspec.yaml"),
    );
    const onPubspecChange = () => void this.reload();
    this.pubspecWatcher.onDidChange(onPubspecChange, this, this.disposables);
    this.pubspecWatcher.onDidCreate(onPubspecChange, this, this.disposables);
    this.pubspecWatcher.onDidDelete(onPubspecChange, this, this.disposables);
    this.disposables.push(this.pubspecWatcher);
  }

  async load(): Promise<void> {
    await this.reload();
  }

  refresh(): void {
    void this.reload();
  }

  private async reload(): Promise<void> {
    if (this.externalFileWatcher) {
      this.externalFileWatcher.dispose();
      this.externalFileWatcher = null;
    }
    for (const d of this.externalListenerDisposables) d.dispose();
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
        const onExternalChange = () => void this.reload();
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

    this._onDidChangeScripts.fire();
  }

  private detectUnlinkedScriptFile(): string | null {
    for (const candidate of SCRIPT_FILE_CANDIDATES) {
      const filePath = path.join(this.workspaceRoot, candidate);
      if (fs.existsSync(filePath)) return candidate;
    }
    return null;
  }

  getNodes(): ScriptNode[] {
    return this.nodes;
  }

  getScriptsFilePath(): string | null {
    return this.scriptsFilePath;
  }

  getStatusMessage(): string {
    return this.statusMessage;
  }

  getUnlinkedScriptFile(): string | null {
    return this.unlinkedScriptFile;
  }

  dispose(): void {
    this._onDidChangeScripts.dispose();
    for (const d of this.disposables) d.dispose();
    for (const d of this.externalListenerDisposables) d.dispose();
    this.externalFileWatcher?.dispose();
  }
}
