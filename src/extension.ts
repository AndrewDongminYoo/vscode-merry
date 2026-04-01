import {
  commands,
  env,
  type ExtensionContext,
  languages,
  StatusBarAlignment,
  type StatusBarItem,
  type Terminal,
  Uri,
  window,
  workspace,
} from "vscode";

import { type CliInfo, detectMerryCli, type MerryCli } from "./cli-detector";
import { MerryCodeLensProvider } from "./merry-codelens-provider";
import { MerryScriptsProvider } from "./merry-scripts-provider";
import type { ScriptItem } from "./script-item";

let terminal: Terminal | null = null;
/**
 * Tracks whether the tracked terminal is actively running a command.
 * Only reliable when shell integration is active; otherwise stays false.
 */
let terminalBusy = false;
let activeCli: MerryCli | null = null;
let statusBar: StatusBarItem | null = null;

export async function activate(context: ExtensionContext) {
  console.log('Your extension "vscode-merry" is now active!');

  const workspaceFolders = workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    window.showInformationMessage("No workspace are activated.");
    return;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;

  // 1. Create provider and await initial load so nodes are ready before
  //    registering the tree view (avoids the empty-tree race condition).
  const provider = new MerryScriptsProvider(workspaceRoot);
  await provider.load();

  // 2. Register tree view — data is already populated.
  const treeView = window.createTreeView("merryScripts", {
    treeDataProvider: provider,
    showCollapseAll: true,
  });

  const updateTreeMessage = () => {
    const msg = provider.getStatusMessage();
    treeView.message = msg.length > 0 ? msg : undefined;
  };
  updateTreeMessage();
  provider.onDidChangeTreeData(updateTreeMessage);

  // 3. Register CodeLens provider for script source files.
  const codeLensProvider = new MerryCodeLensProvider(provider);
  const docSelector = [
    { language: "yaml", pattern: "**/pubspec.yaml" },
    { language: "yaml", pattern: "**/merry.yaml" },
    { language: "yaml", pattern: "**/derry.yaml" },
    { language: "yaml", pattern: "**/*.yaml" },
  ];

  context.subscriptions.push(
    treeView,
    provider,
    languages.registerCodeLensProvider(docSelector, codeLensProvider),

    window.onDidCloseTerminal((closed) => {
      if (terminal === closed) {
        terminal = null;
        terminalBusy = false;
      }
    }),

    // Shell integration events: track whether our terminal is executing a command.
    // These only fire when VS Code shell integration is active in the terminal;
    // if shell integration is unavailable the busy flag stays false and reuse
    // falls back to the user's setting without busy-check enforcement.
    window.onDidStartTerminalShellExecution((e) => {
      if (e.terminal === terminal) {
        terminalBusy = true;
      }
    }),
    window.onDidEndTerminalShellExecution((e) => {
      if (e.terminal === terminal) {
        terminalBusy = false;
      }
    }),
  );

  // 4. Detect CLI in background — does not block tree view display.
  detectMerryCli().then((cliInfo) => {
    if (!cliInfo) {
      showCliMissingStatusBar(context);
      showInstallPrompt();
    } else {
      activeCli = cliInfo.cli;
      showCliDetectedMessage(cliInfo);
    }
  });

  // 5. Register commands.
  context.subscriptions.push(
    commands.registerCommand("vscode-merry.installCli", () => {
      showInstallPrompt();
    }),

    commands.registerCommand("vscode-merry.runScript", (item: ScriptItem) => {
      if (!item || item.node.isGroup) return;
      if (!activeCli) {
        showInstallPrompt();
        return;
      }
      void runInTerminal(item.node.fullPath, activeCli);
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

async function runInTerminal(scriptPath: string, cli: MerryCli): Promise<void> {
  const config = workspace.getConfiguration("vscode-merry");
  const reuse = config.get<string>("reuseTerminal", "never");

  // Shell integration lets us reliably detect busy state.
  // If it is not active, assume not-busy so the user's reuse preference is respected.
  const shellIntegrationActive = terminal?.shellIntegration !== undefined;
  const isBusy = shellIntegrationActive && terminalBusy;

  // A busy terminal must never be reused — always open a fresh one.
  const candidateAvailable = terminal !== null && !isBusy;

  let shouldReuse = false;

  if (candidateAvailable) {
    if (reuse === "always") {
      shouldReuse = true;
    } else if (reuse === "ask") {
      const choice = await window.showQuickPick(
        ["Reuse existing terminal", "Create new terminal"],
        { placeHolder: "How would you like to run this script?" },
      );
      shouldReuse = choice === "Reuse existing terminal";
    }
  }

  if (shouldReuse && terminal) {
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
