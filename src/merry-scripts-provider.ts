import {
  type Disposable,
  EventEmitter,
  type TreeDataProvider,
  type TreeItem,
} from "vscode";

import type { ScriptNode } from "./merry-parser";
import type { MerryScriptService } from "./merry-script-service";
import { ScriptItem } from "./script-item";

export class MerryScriptsProvider
  implements TreeDataProvider<ScriptItem>, Disposable
{
  private readonly _onDidChangeTreeData = new EventEmitter<
    ScriptItem | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private readonly disposables: Disposable[] = [];

  constructor(private readonly service: MerryScriptService) {
    service.onDidChangeScripts(
      () => this._onDidChangeTreeData.fire(),
      this,
      this.disposables,
    );
  }

  getTreeItem(element: ScriptItem): TreeItem {
    return element;
  }

  getChildren(element?: ScriptItem): ScriptItem[] {
    if (!element) {
      return this.service.getNodes().map((n) => new ScriptItem(n));
    }
    if (element.node.isGroup) {
      return element.node.children.map((n) => new ScriptItem(n));
    }
    return [];
  }

  getScriptsFilePath(): string | null {
    return this.service.getScriptsFilePath();
  }

  getNodes(): ScriptNode[] {
    return this.service.getNodes();
  }

  getStatusMessage(): string {
    return this.service.getStatusMessage();
  }

  getUnlinkedScriptFile(): string | null {
    return this.service.getUnlinkedScriptFile();
  }

  refresh(): void {
    this.service.refresh();
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
