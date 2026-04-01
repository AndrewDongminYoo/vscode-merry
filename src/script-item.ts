import {
  MarkdownString,
  ThemeIcon,
  TreeItem,
  TreeItemCollapsibleState,
} from "vscode";

import type { ScriptNode } from "./merry-parser";

export class ScriptItem extends TreeItem {
  readonly node: ScriptNode;

  constructor(node: ScriptNode) {
    const collapsible = node.isGroup
      ? TreeItemCollapsibleState.Collapsed
      : TreeItemCollapsibleState.None;

    super(node.label, collapsible);

    this.node = node;

    if (node.isGroup) {
      this.iconPath = new ThemeIcon("folder");
      this.contextValue = "scriptGroup";
    } else {
      this.iconPath = new ThemeIcon(node.isHook ? "arrow-right" : "play");
      this.contextValue = "script";

      const displayCmd =
        node.description ?? (node.commands.length > 0 ? node.commands[0] : "");
      this.description = displayCmd;

      this.tooltip = new MarkdownString(
        [
          `**${node.fullPath}**`,
          ...(node.description ? [`_${node.description}_`] : []),
          "```",
          node.commands.join("\n"),
          "```",
          ...(node.workdir ? [`workdir: \`${node.workdir}\``] : []),
        ].join("\n\n"),
      );

      this.command = {
        title: "Run Script",
        command: "merry.runScript",
        arguments: [this],
      };
    }
  }
}
