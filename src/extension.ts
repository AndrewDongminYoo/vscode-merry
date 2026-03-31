import * as vscode from "vscode";
import { MerryScriptsProvider } from "./merry-scripts-provider";
import { ScriptItem } from "./script-item";
import { detectMerryCli, MerryCli } from "./cli-detector";

let terminal: vscode.Terminal | null = null;
let activeCli: MerryCli | null = null;

export async function activate(context: vscode.ExtensionContext) {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return;
  }

  activeCli = await detectMerryCli();

  if (!activeCli) {
    showInstallPrompt();
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
        if (!activeCli) {
          showInstallPrompt();
          return;
        }
        runInTerminal(item.node.fullPath, activeCli);
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

function runInTerminal(scriptPath: string, cli: MerryCli): void {
  const config = vscode.workspace.getConfiguration("merry");
  const reuse = config.get<boolean>("reuseTerminal", false);

  if (reuse && terminal) {
    terminal.show();
  } else {
    terminal = vscode.window.createTerminal("Merry Scripts");
    terminal.show();
  }

  terminal.sendText(`${cli} run ${scriptPath}`);
}

function showInstallPrompt(): void {
  const installAction = "Install merry";
  const docsAction = "Open pub.dev";

  vscode.window
    .showInformationMessage(
      "Merry Scripts: neither 'merry' nor 'derry' was found. Install merry to run scripts.",
      installAction,
      docsAction,
    )
    .then((choice) => {
      if (choice === installAction) {
        const t = vscode.window.createTerminal("Merry Install");
        t.show();
        t.sendText("dart pub global activate merry");
        // Re-detect after a moment to update activeCli
        setTimeout(async () => {
          activeCli = await detectMerryCli();
        }, 5000);
      } else if (choice === docsAction) {
        vscode.env.openExternal(
          vscode.Uri.parse("https://pub.dev/packages/merry"),
        );
      }
    });
}

export function deactivate() {
  if (terminal) {
    terminal.dispose();
    terminal = null;
  }
}
