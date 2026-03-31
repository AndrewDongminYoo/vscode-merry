import * as vscode from "vscode";
import { MerryScriptsProvider } from "./merry-scripts-provider";
import { ScriptItem } from "./script-item";

let terminal: vscode.Terminal | null = null;

export function activate(context: vscode.ExtensionContext) {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;
  const provider = new MerryScriptsProvider(workspaceRoot);

  vscode.window.onDidCloseTerminal(
    (closed) => {
      if (terminal === closed) {
        terminal = null;
      }
    },
    null,
    context.subscriptions,
  );

  context.subscriptions.push(
    provider,
    vscode.window.registerTreeDataProvider("merryScripts", provider),

    vscode.commands.registerCommand(
      "vscode-merry.runScript",
      (item: ScriptItem) => {
        if (!item || item.node.isGroup) {
          return;
        }
        runInTerminal(item.node.fullPath);
      },
    ),

    vscode.commands.registerCommand("vscode-merry.refresh", () => {
      provider.refresh();
    }),

    vscode.commands.registerCommand("vscode-merry.openScriptSource", () => {
      const filePath = provider.getScriptsFilePath();
      if (filePath) {
        vscode.window.showTextDocument(vscode.Uri.file(filePath));
      }
    }),
  );
}

function runInTerminal(scriptPath: string): void {
  const config = vscode.workspace.getConfiguration("vscode-merry");
  const reuse = config.get<boolean>("reuseTerminal", false);

  if (reuse && terminal) {
    terminal.show();
  } else {
    terminal = vscode.window.createTerminal("Merry Scripts");
    terminal.show();
  }

  terminal.sendText(`merry run ${scriptPath}`);
}

export function deactivate() {
  if (terminal) {
    terminal.dispose();
    terminal = null;
  }
}
