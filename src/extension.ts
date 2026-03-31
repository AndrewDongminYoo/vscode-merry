import * as vscode from "vscode";
import { MerryScriptsProvider } from "./merry-scripts-provider";
import { ScriptItem } from "./script-item";
import { detectMerryCli, CliInfo, MerryCli } from "./cli-detector";

let terminal: vscode.Terminal | null = null;
let activeCli: MerryCli | null = null;
let cliStatusBarItem: vscode.StatusBarItem | null = null;

export async function activate(context: vscode.ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Your extension "vscode-merry" is now active!');

  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    vscode.window.showInformationMessage("No workspace are activated.");
    return;
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("vscode-merry.installCli", () => {
      showInstallPrompt();
    }),
  );

  const cliInfo = await detectMerryCli();

  if (!cliInfo) {
    showCliMissingStatusBar(context);
    showInstallPrompt();
  } else {
    activeCli = cliInfo.cli;
    showCliDetectedMessage(cliInfo);
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

function showCliMissingStatusBar(context: vscode.ExtensionContext): void {
  if (cliStatusBarItem) {
    cliStatusBarItem.show();
    return;
  }

  cliStatusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  cliStatusBarItem.text = "$(warning) Merry: CLI not found";
  cliStatusBarItem.tooltip =
    "merry (or derry) is not installed. Click to install.";
  cliStatusBarItem.command = "vscode-merry.installCli";
  cliStatusBarItem.show();
  context.subscriptions.push(cliStatusBarItem);
}

function runInTerminal(scriptPath: string, cli: MerryCli): void {
  const config = vscode.workspace.getConfiguration("vscode-merry");
  const reuse = config.get<boolean>("reuseTerminal", false);

  if (reuse && terminal) {
    terminal.show();
  } else {
    terminal = vscode.window.createTerminal("Merry Scripts");
    terminal.show();
  }

  terminal.sendText(`${cli} run ${scriptPath}`);
}

function showCliDetectedMessage(info: CliInfo): void {
  const versionPart = info.version ? ` v${info.version}` : "";
  const pathPart = info.binPath ? ` — ${info.binPath}` : "";
  vscode.window.showInformationMessage(
    `Merry Scripts: '${info.cli}'${versionPart} detected${pathPart}`,
  );
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
        // Re-detect after install completes
        setTimeout(async () => {
          const info = await detectMerryCli();
          if (info) {
            activeCli = info.cli;
            if (cliStatusBarItem) {
              cliStatusBarItem.dispose();
              cliStatusBarItem = null;
            }
            showCliDetectedMessage(info);
          }
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
  if (cliStatusBarItem) {
    cliStatusBarItem.dispose();
    cliStatusBarItem = null;
  }
}
