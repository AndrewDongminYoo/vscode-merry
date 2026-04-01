import {
  CodeLens,
  type CodeLensProvider,
  EventEmitter,
  Position,
  Range,
  type TextDocument,
} from "vscode";

import type { ScriptNode } from "./merry-parser";
import type { MerryScriptsProvider } from "./merry-scripts-provider";

export class MerryCodeLensProvider implements CodeLensProvider {
  private readonly _onDidChangeCodeLenses = new EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  constructor(private readonly provider: MerryScriptsProvider) {
    provider.onDidChangeTreeData(() => this._onDidChangeCodeLenses.fire());
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

    const text = document.getText();
    const lines = text.split("\n");
    return this.buildLenses(document, nodes, lines);
  }

  private buildLenses(
    document: TextDocument,
    nodes: ScriptNode[],
    lines: string[],
  ): CodeLens[] {
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
        // Groups are not directly runnable — recurse into children only
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
          command: "vscode-merry.runScript",
          arguments: [{ node }],
        }),
      );
    }
  }

  /**
   * Find the first line index where the given YAML key appears at the start
   * of a line (after optional leading whitespace), followed by a colon.
   */
  private findKeyLine(key: string, lines: string[]): number {
    // Escape special regex chars in key
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`^\\s*${escaped}\\s*:`);
    return lines.findIndex((line) => pattern.test(line));
  }
}
