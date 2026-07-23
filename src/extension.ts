import * as path from "path";
import {
  commands,
  type ExtensionContext,
  languages,
  tasks,
  Uri,
  window,
  workspace,
} from "vscode";

import { Commands } from "./commands";
import { MerryCodeLensProvider } from "./merry-codelens-provider";
import { MerryExecutionService } from "./merry-execution-service";
import { MerryScriptService } from "./merry-script-service";
import { MerryScriptsProvider } from "./merry-scripts-provider";
import { MerryTaskProvider } from "./merry-task-provider";
import type { ScriptItem } from "./script-item";

export async function activate(context: ExtensionContext) {
  console.log('Your extension "vscode-merry-scripts" is now active!');

  const workspaceFolders = workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    window.showInformationMessage("No workspace are activated.");
    return;
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;
  const service = new MerryScriptService(workspaceRoot);
  await service.load();
  const provider = new MerryScriptsProvider(service);
  const executionService = new MerryExecutionService(context, workspaceRoot);
  await executionService.initialize();
  const taskProvider = new MerryTaskProvider(
    service,
    workspaceRoot,
    () => executionService.currentCliInfo,
    executionService.onDidChangeCliInfo,
  );

  const treeView = window.createTreeView("merryScripts", {
    treeDataProvider: provider,
    showCollapseAll: true,
  });

  const updateTreeMessage = () => {
    const message = provider.getStatusMessage();
    treeView.message = message.length > 0 ? message : undefined;
  };
  updateTreeMessage();

  let lastNotifiedUnlinked: string | null = null;
  const checkUnlinkedScriptFile = () => {
    const unlinked = provider.getUnlinkedScriptFile();
    if (unlinked && unlinked !== lastNotifiedUnlinked) {
      lastNotifiedUnlinked = unlinked;
      window
        .showInformationMessage(
          `Merry Scripts: found '${unlinked}' but pubspec.yaml has no \`scripts:\` field. Add \`scripts: ${unlinked}\` to load scripts.`,
          "Open pubspec.yaml",
        )
        .then((choice) => {
          if (choice === "Open pubspec.yaml") {
            const pubspecPath = path.join(workspaceRoot, "pubspec.yaml");
            void window.showTextDocument(Uri.file(pubspecPath));
          }
        });
    } else if (!unlinked) {
      lastNotifiedUnlinked = null;
    }
  };
  checkUnlinkedScriptFile();

  const codeLensProvider = new MerryCodeLensProvider(provider);
  const documentSelector = [
    { scheme: "file", language: "yaml", pattern: "**/pubspec.yaml" },
    { scheme: "file", language: "yaml", pattern: "**/merry.yaml" },
    { scheme: "file", language: "yaml", pattern: "**/derry.yaml" },
    { scheme: "file", language: "yaml", pattern: "**/*.yaml" },
  ];

  context.subscriptions.push(
    service,
    executionService,
    tasks.registerTaskProvider(MerryTaskProvider.taskType, taskProvider),
    taskProvider,
    treeView,
    provider,
    provider.onDidChangeTreeData(updateTreeMessage),
    provider.onDidChangeTreeData(checkUnlinkedScriptFile),
    languages.registerCodeLensProvider(documentSelector, codeLensProvider),
    commands.registerCommand(Commands.installCli, () => {
      void executionService.installMerry();
    }),
    commands.registerCommand(Commands.runScript, async (item: ScriptItem) => {
      if (!item || item.node.isGroup) return;
      await executionService.runScript(item.node.fullPath);
    }),
    commands.registerCommand(Commands.refresh, async () => {
      provider.refresh();
      await executionService.refresh();
    }),
    commands.registerCommand(Commands.openScriptSource, () => {
      const filePath = provider.getScriptsFilePath();
      if (filePath) void window.showTextDocument(Uri.file(filePath));
    }),
  );
}

export function deactivate() {}
