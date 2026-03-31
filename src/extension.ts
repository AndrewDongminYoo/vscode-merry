import {
  commands,
  env,
  type ExtensionContext,
  StatusBarAlignment,
  type StatusBarItem,
  type Terminal,
  Uri,
  window,
  workspace,
} from "vscode";

import { type CliInfo, detectMerryCli, type MerryCli } from "./cli-detector";
import { MerryScriptsProvider } from "./merry-scripts-provider";
import type { ScriptItem } from "./script-item";

let terminal: Terminal | null = null;
let activeCli: MerryCli | null = null;
let statusBar: StatusBarItem | null = null;

export async function activate(context: ExtensionContext) {
  // Use the console to output diagnostic information (console.log) and errors (console.error)
  // This line of code will only be executed once when your extension is activated
  console.log('Your extension "vscode-merry" is now active!');

  const workspaceFolders = workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    window.showInformationMessage("No workspace are activated.");
    return;
  }

  context.subscriptions.push(
    commands.registerCommand("vscode-merry.installCli", () => {
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

  window.onDidCloseTerminal(
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
    window.registerTreeDataProvider("merryScripts", provider),

    commands.registerCommand("vscode-merry.runScript", (item: ScriptItem) => {
      if (!item || item.node.isGroup) {
        return;
      }
      if (!activeCli) {
        showInstallPrompt();
        return;
      }
      runInTerminal(item.node.fullPath, activeCli);
    }),

    commands.registerCommand("vscode-merry.refresh", () => {
      provider.refresh();
    }),

    commands.registerCommand("vscode-merry.openScriptSource", () => {
      const filePath = provider.getScriptsFilePath();
      if (filePath) {
        window.showTextDocument(Uri.file(filePath));
      }
    }),
  );
}

function showCliMissingStatusBar(context: ExtensionContext): void {
  if (statusBar) {
    statusBar.show();
    return;
  }

  statusBar = window.createStatusBarItem(StatusBarAlignment.Left, 100);
  statusBar.text = "$(warning) Merry: CLI not found";
  statusBar.tooltip = "merry (or derry) is not installed. Click to install.";
  statusBar.command = "vscode-merry.installCli";
  statusBar.show();
  context.subscriptions.push(statusBar);
}

function runInTerminal(scriptPath: string, cli: MerryCli): void {
  const config = workspace.getConfiguration("vscode-merry");
  const reuse = config.get<boolean>("reuseTerminal", false);

  if (reuse && terminal) {
    terminal.show();
  } else {
    terminal = window.createTerminal("Merry Scripts");
    terminal.show();
  }

  terminal.sendText(`${cli} run ${scriptPath}`);
}

function showCliDetectedMessage(info: CliInfo): void {
  const versionPart = info.version ? ` v${info.version}` : "";
  const pathPart = info.binPath ? ` — ${info.binPath}` : "";
  window.showInformationMessage(
    `Merry Scripts: '${info.cli}'${versionPart} detected${pathPart}`,
  );
}

function showInstallPrompt(): void {
  const installAction = "Install merry";
  const docsAction = "Open pub.dev";

  window
    .showInformationMessage(
      "Merry Scripts: neither 'merry' nor 'derry' was found. Install merry to run scripts.",
      installAction,
      docsAction,
    )
    .then((choice) => {
      if (choice === installAction) {
        const t = window.createTerminal("Merry Install");
        t.show();
        t.sendText("dart pub global activate merry");
        // Re-detect after install completes
        setTimeout(async () => {
          const info = await detectMerryCli();
          if (info) {
            activeCli = info.cli;
            if (statusBar) {
              statusBar.dispose();
              statusBar = null;
            }
            showCliDetectedMessage(info);
          }
        }, 5000);
      } else if (choice === docsAction) {
        env.openExternal(Uri.parse("https://pub.dev/packages/merry"));
      }
    });
}

export function deactivate() {
  if (terminal) {
    terminal.dispose();
    terminal = null;
  }
  if (statusBar) {
    statusBar.dispose();
    statusBar = null;
  }
}
