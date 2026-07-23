import {
  type Disposable,
  env,
  EventEmitter,
  type ExtensionContext,
  StatusBarAlignment,
  type StatusBarItem,
  type Terminal,
  Uri,
  window,
  workspace,
} from "vscode";

import {
  type CliDetectionResult,
  type CliInfo,
  detectMerryCli,
} from "./cli-detector";
import { Commands } from "./commands";
import { formatShellCommand, type TerminalShell } from "./shell-command";
import type { ToolchainResolution } from "./toolchain-environment";
import { resolveWorkspaceToolchain } from "./vscode-toolchain-adapter";

export type { TerminalShell } from "./shell-command";

export function formatTerminalCommand(
  launcherPath: string,
  scriptPath: string,
  shell: TerminalShell,
): string {
  return formatShellCommand(
    [launcherPath, "run", ...scriptPath.split(/\s+/)],
    shell,
  );
}

export function terminalShellForProfile(
  platform: NodeJS.Platform,
  profile: string,
): TerminalShell {
  if (platform === "win32") {
    if (/bash|git bash|msys|cygwin|wsl/i.test(profile)) return "posix";
    if (/cmd|command prompt/i.test(profile)) return "cmd";
    return "powershell";
  }
  return /powershell|pwsh/i.test(profile) ? "powershell" : "posix";
}

export class MerryExecutionService implements Disposable {
  private readonly contextChanged = new EventEmitter<void>();
  readonly onDidChangeCliInfo = this.contextChanged.event;

  private readonly disposables: Disposable[] = [];
  private cliInfo: CliInfo | null = null;
  private terminal: Terminal | null = null;
  private installTerminal: Terminal | null = null;
  private terminalFingerprint: string | null = null;
  private terminalBusy = false;
  private statusBar: StatusBarItem | null = null;
  private installPromptAvailable = false;
  private refreshGeneration = 0;

  constructor(
    private readonly context: ExtensionContext,
    private readonly workspaceRoot: string,
  ) {
    this.disposables.push(
      workspace.onDidGrantWorkspaceTrust(() => void this.refresh()),
      workspace.onDidChangeConfiguration((event) => {
        if (
          event.affectsConfiguration("merry.dartSdkPath") ||
          event.affectsConfiguration("merry.pubCachePath") ||
          event.affectsConfiguration("dart.flutterSdkPath") ||
          event.affectsConfiguration("dart.getFlutterSdkCommand") ||
          event.affectsConfiguration("dart.sdkPath") ||
          event.affectsConfiguration("dart.getDartSdkCommand")
        ) {
          void this.refresh();
        }
      }),
      window.onDidCloseTerminal((closed) => {
        if (closed === this.installTerminal) this.installTerminal = null;
        if (closed !== this.terminal) return;
        this.terminal = null;
        this.terminalFingerprint = null;
        this.terminalBusy = false;
      }),
      window.onDidStartTerminalShellExecution((event) => {
        if (event.terminal === this.terminal) this.terminalBusy = true;
      }),
      window.onDidEndTerminalShellExecution((event) => {
        if (event.terminal === this.terminal) this.terminalBusy = false;
        if (event.terminal === this.installTerminal) {
          this.installTerminal = null;
          void this.refresh();
        }
      }),
    );
  }

  get currentCliInfo(): CliInfo | null {
    return this.cliInfo;
  }

  async initialize(): Promise<void> {
    await this.refresh();
  }

  async refresh(): Promise<void> {
    const generation = ++this.refreshGeneration;
    const previous = this.cliInfo;
    const resolution = await resolveWorkspaceToolchain(this.workspaceRoot);
    if (generation !== this.refreshGeneration) return;
    if (resolution.kind !== "resolved") {
      this.cliInfo = null;
      this.installPromptAvailable = false;
      this.showResolutionFailure(resolution);
      this.fireIfChanged(previous);
      return;
    }
    const detection = await detectMerryCli(resolution);
    if (generation !== this.refreshGeneration) return;
    this.applyDetection(detection, previous);
    this.fireIfChanged(previous);
  }

  async runScript(scriptPath: string): Promise<void> {
    await this.refresh();
    const info = this.cliInfo;
    if (!info) {
      if (this.installPromptAvailable) this.showInstallPrompt();
      return;
    }
    const reuse = workspace
      .getConfiguration("merry")
      .get<string>("reuseTerminal", "never");
    const reusable =
      this.terminal !== null &&
      !this.terminalBusy &&
      this.terminalFingerprint === info.toolchain.fingerprint;
    let shouldReuse = reusable && reuse === "always";
    if (reusable && reuse === "ask") {
      const choice = await window.showQuickPick(
        ["Reuse existing terminal", "Create new terminal"],
        { placeHolder: "How would you like to run this script?" },
      );
      shouldReuse =
        choice === "Reuse existing terminal" &&
        this.terminal !== null &&
        !this.terminalBusy &&
        this.terminalFingerprint === info.toolchain.fingerprint;
    }
    if (!shouldReuse) {
      this.terminal = window.createTerminal({
        name: "Merry Scripts",
        cwd: this.workspaceRoot,
        env: info.toolchain.environment,
      });
      this.terminalFingerprint = info.toolchain.fingerprint;
    }
    const target = this.terminal;
    if (!target) return;
    target.show();
    target.sendText(
      formatTerminalCommand(
        info.launcherPath,
        scriptPath,
        this.terminalShell(),
      ),
    );
  }

  async installMerry(): Promise<void> {
    const resolution = await resolveWorkspaceToolchain(this.workspaceRoot);
    if (resolution.kind !== "resolved") {
      this.showResolutionFailure(resolution);
      return;
    }
    const terminal = window.createTerminal({
      name: "Merry Install",
      cwd: this.workspaceRoot,
      env: resolution.environment,
    });
    this.installTerminal = terminal;
    terminal.show();
    terminal.sendText(
      formatShellCommand(
        [resolution.dartExecutable, "pub", "global", "activate", "merry"],
        this.terminalShell(),
      ),
    );
    if (!terminal.shellIntegration) {
      void window
        .showInformationMessage(
          "Refresh Merry detection after installation completes.",
          "Refresh detection",
        )
        .then((choice) => {
          if (choice === "Refresh detection") void this.refresh();
        });
    }
  }

  dispose(): void {
    this.terminal?.dispose();
    this.installTerminal?.dispose();
    this.statusBar?.dispose();
    this.contextChanged.dispose();
    for (const disposable of this.disposables) disposable.dispose();
  }

  private applyDetection(
    result: CliDetectionResult,
    previous: CliInfo | null,
  ): void {
    if (result.kind === "detected") {
      this.cliInfo = result.info;
      this.installPromptAvailable = false;
      this.clearStatus();
      if (!sameCliInfo(previous, result.info)) {
        const version = result.info.version ? ` v${result.info.version}` : "";
        window.showInformationMessage(
          `Merry Scripts: '${result.info.cli}'${version} detected at ${result.info.launcherPath}`,
        );
      }
      return;
    }
    this.cliInfo = null;
    this.installPromptAvailable = true;
    this.showMissingStatus();
    if (result.kind === "launcher-missing") {
      window.showWarningMessage(
        `Merry Scripts: '${result.cli}' is registered but its launcher is missing at ${result.expectedPath}.`,
      );
    }
  }

  private showResolutionFailure(
    result: Exclude<ToolchainResolution, { kind: "resolved" }>,
  ): void {
    if (result.kind === "workspace-untrusted") {
      this.clearStatus();
      window.showWarningMessage(
        "Merry Scripts: trust this workspace to resolve Dart and run scripts.",
      );
      return;
    }
    this.showMissingStatus();
    if (result.kind === "invalid-configuration") {
      window.showErrorMessage(
        `Merry Scripts: ${result.setting} is invalid: ${result.reason}.`,
      );
    } else if (result.kind === "pub-cache-unavailable") {
      window.showErrorMessage(
        `Merry Scripts: Pub cache is unavailable at ${result.path}: ${result.reason}.`,
      );
    } else {
      window.showErrorMessage("Merry Scripts: no Dart SDK was found.");
    }
  }

  private showMissingStatus(): void {
    if (!this.statusBar) {
      this.statusBar = window.createStatusBarItem(StatusBarAlignment.Left, 100);
      this.statusBar.text = "$(warning) Merry: CLI not found";
      this.statusBar.command = Commands.installCli;
      this.context.subscriptions.push(this.statusBar);
    }
    this.statusBar.show();
  }

  private clearStatus(): void {
    this.statusBar?.dispose();
    this.statusBar = null;
  }

  private showInstallPrompt(): void {
    window
      .showInformationMessage(
        "Merry Scripts: neither 'merry' nor 'derry' is executable in the resolved Pub cache.",
        "Install merry",
        "Open pub.dev",
      )
      .then((choice) => {
        if (choice === "Install merry") void this.installMerry();
        if (choice === "Open pub.dev") {
          void env.openExternal(Uri.parse("https://pub.dev/packages/merry"));
        }
      });
  }

  private fireIfChanged(previous: CliInfo | null): void {
    if (
      previous?.launcherPath !== this.cliInfo?.launcherPath ||
      previous?.toolchain.fingerprint !== this.cliInfo?.toolchain.fingerprint
    ) {
      this.contextChanged.fire();
    }
  }

  private terminalShell(): TerminalShell {
    const profileKey =
      process.platform === "win32"
        ? "defaultProfile.windows"
        : process.platform === "darwin"
          ? "defaultProfile.osx"
          : "defaultProfile.linux";
    const profile = workspace
      .getConfiguration("terminal.integrated")
      .get<string>(profileKey, "");
    return terminalShellForProfile(process.platform, profile);
  }
}

function sameCliInfo(left: CliInfo | null, right: CliInfo | null): boolean {
  return (
    left?.cli === right?.cli &&
    left?.version === right?.version &&
    left?.launcherPath === right?.launcherPath &&
    left?.toolchain.fingerprint === right?.toolchain.fingerprint
  );
}
