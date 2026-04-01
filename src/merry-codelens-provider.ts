import {
  CodeLens,
  type CodeLensProvider,
  EventEmitter,
  Position,
  Range,
  type TextDocument,
} from "vscode";

import { Commands } from "./commands";
import type { ScriptNode } from "./merry-parser";
import type { MerryScriptsProvider } from "./merry-scripts-provider";

export class MerryCodeLensProvider implements CodeLensProvider {
  private readonly _onDidChangeCodeLenses = new EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  /** Cached per-label RegExp, invalidated when tree nodes change. */
  private readonly regExpCache = new Map<string, RegExp>();

  constructor(private readonly provider: MerryScriptsProvider) {
    provider.onDidChangeTreeData(() => {
      this.regExpCache.clear();
      this._onDidChangeCodeLenses.fire();
    });
  }

  provideCodeLenses(document: TextDocument): CodeLens[] {
    const scriptsFilePath = this.provider.getScriptsFilePath();
    if (!scriptsFilePath || document.uri.fsPath !== scriptsFilePath) {
      return [];
    }

    const nodes = this.provider.getNodes();
    if (nodes.length === 0) {
      return [];
    }

    const lines = document.getText().split("\n");
    const lenses: CodeLens[] = [];
    this.collectLenses(nodes, lines, document, lenses);
    return lenses;
  }

  private collectLenses(
    nodes: ScriptNode[],
    lines: string[],
    document: TextDocument,
    lenses: CodeLens[],
  ): void {
    for (const node of nodes) {
      if (node.isGroup) {
        this.collectLenses(node.children, lines, document, lenses);
        continue;
      }

      const lineIndex = this.findKeyLine(node.label, lines);
      if (lineIndex === -1) {
        continue;
      }

      const range = new Range(
        new Position(lineIndex, 0),
        new Position(lineIndex, lines[lineIndex].length),
      );

      const icon = node.isHook ? "$(arrow-right)" : "$(play)";
      const suffix = node.isPlatformDispatch ? " (platform)" : "";
      lenses.push(
        new CodeLens(range, {
          title: `${icon} Run: ${node.fullPath}${suffix}`,
          command: Commands.runScript,
          arguments: [{ node }],
        }),
      );
    }
  }

  private findKeyLine(key: string, lines: string[]): number {
    let pattern = this.regExpCache.get(key);
    if (!pattern) {
      const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      pattern = new RegExp(`^\\s*${escaped}\\s*:`);
      this.regExpCache.set(key, pattern);
    }
    return lines.findIndex((line) => pattern.test(line));
  }
}
