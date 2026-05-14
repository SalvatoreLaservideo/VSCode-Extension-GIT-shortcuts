import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

export function activate(context: vscode.ExtensionContext) {
    console.log('Congratulations, your extension "gitextensionwrap" is now active!');

    const helloDisposable = vscode.commands.registerCommand('gitextensionwrap.helloWorld', () => {
        vscode.window.showInformationMessage('GitShortcut Extension Active!');
    });

    const gitBashDisposable = vscode.commands.registerCommand('gitextensionwrap.openGitBash', async (uri: vscode.Uri) => {
        let targetPath: string;

        if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
            targetPath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        } else if (uri) {
            try {
                const stat = fs.statSync(uri.fsPath);
                targetPath = stat.isDirectory() ? uri.fsPath : path.dirname(uri.fsPath);
            } catch (err) {
                vscode.window.showErrorMessage('Git Shortcuts: failed to read selected path.');
                return;
            }
        } else {
            vscode.window.showErrorMessage('No folder selected and no workspace open.');
            return;
        }

        try {
            const config = loadOrCreateConfig(targetPath);
            const gitExe = config['git-exe'];
            const bashExe = config['bash-exe'];
            const shellPath = fs.existsSync(bashExe) ? bashExe : gitExe;

            // Open panel in main window first, then move it to a new window.
            const panel = vscode.window.createWebviewPanel(
                'gitShortcuts',
                'Git Shortcuts',
                vscode.ViewColumn.Nine,
                {
                    enableScripts: true,
                    localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, '/src/ui_panel')],
                }
            );

            try {
                panel.webview.html = getWebviewContent(panel.webview, context.extensionUri, config);
            } catch (err) {
                logError(targetPath, 'getWebviewContent', err);
                panel.webview.html = `<body style="color:red;font-family:sans-serif;padding:1em">
                    <b>Git Shortcuts failed to load.</b><br>
                    Check <code>.git-extension-wrap/errors.log</code> for details.
                </body>`;
            }

            await vscode.commands.executeCommand('workbench.action.moveEditorGroupToNewWindow');

            // Give the new window time to open and become the active window.
            await new Promise<void>(resolve => setTimeout(resolve, 500));

            // Terminal is created in the now-active new window, beside the panel.
            const terminal = vscode.window.createTerminal({
                name: 'Git Bash',
                shellPath,
                cwd: targetPath,
                location: { viewColumn: vscode.ViewColumn.Beside },
            });
            terminal.show();

            // --- mutual close logic ---
            let disposed = false;
            let onTerminalClose: vscode.Disposable;
            let onFolderChange: vscode.Disposable;

            function closeAll() {
                if (disposed) { return; }
                disposed = true;
                terminal.dispose();
                panel.dispose();
                onTerminalClose.dispose();
                onFolderChange.dispose();
            }

            panel.onDidDispose(closeAll);

            onTerminalClose = vscode.window.onDidCloseTerminal(t => {
                if (t === terminal) { closeAll(); }
            });

            onFolderChange = vscode.workspace.onDidChangeWorkspaceFolders(() => {
                if (!vscode.workspace.workspaceFolders?.length) { closeAll(); }
            });

            context.subscriptions.push({ dispose: closeAll });
            // --------------------------

            panel.webview.onDidReceiveMessage(async (message: { command: string; branchName?: string; key?: string; value?: string }) => {
                try {
                    const b = (message.branchName ?? '').trim();

                    if (message.command === 'saveConfig' && message.key) {
                        saveConfig(targetPath, message.key, message.value ?? '');
                        return;
                    }

                    if (message.command === 'branchDelete') {
                        const answer = await vscode.window.showWarningMessage(
                            `Delete branch "${b}"? This cannot be undone.`,
                            { modal: true },
                            'Delete'
                        );
                        if (answer !== 'Delete') { return; }
                        terminal.show();
                        terminal.sendText(`git branch -D ${b}`, true);
                        return;
                    }

                    const defs: Record<string, { text: string; run: boolean }> = {
                        status: { text: 'git status', run: true },
                        log: { text: 'git log > main', run: true },
                        branch: { text: 'git branch', run: true },
                        addPng: { text: 'git add *.png', run: true },
                        addSvg: { text: 'git add *.svg', run: true },
                        addJpeg: { text: 'git add *.jpeg', run: true },
                        rebaseInteractive: { text: 'git rebase -i HEAD~', run: false },
                        resetHard: { text: 'git reset --hard origin/main', run: false },
                        resetHardPush: { text: 'git push origin main --force', run: false },
                        pull: { text: 'git pull', run: true },
                        push: { text: 'git push', run: true },
                        checkoutNew: { text: `git checkout -b ${b}`, run: true },
                        checkout: { text: `git checkout ${b}`, run: true },
                        logToFile: { text: `git log > ${b}`, run: true },
                        mainLogToFile: { text: `git log > ${b}`, run: true },
                        mainCheckout: { text: `git checkout ${b}`, run: true },
                    };
                    const def = defs[message.command];
                    if (def) {
                        terminal.show();
                        terminal.sendText(def.text, def.run);
                    }
                } catch (err) {
                    logError(targetPath, `webview message: ${message.command}`, err);
                }
            });
        } catch (err) {
            logError(targetPath, 'openGitBash', err);
            vscode.window.showErrorMessage(`Git Shortcuts error — see .git-extension-wrap/errors.log`);
        }
    });

    context.subscriptions.push(helloDisposable, gitBashDisposable);
}

// ── error logging ─────────────────────────────────────────────────────────────

function logError(workspacePath: string, context: string, err: unknown): void {
    try {
        const logPath = path.join(workspacePath, '.git-extension-wrap', 'errors.log');
        fs.mkdirSync(path.dirname(logPath), { recursive: true });
        const message = err instanceof Error
            ? `${err.message}\n${err.stack ?? ''}`
            : String(err);
        const entry = `[${new Date().toISOString()}] [${context}]\n${message}\n\n`;
        fs.appendFileSync(logPath, entry, 'utf8');
    } catch { /* ignore log write failures */ }
}

// ── config helpers ────────────────────────────────────────────────────────────

interface ExtConfig {
    'info': string;
    'main-branch-name': string;
    'local-branch-name': string;
    'git-exe': string;
    'bash-exe': string;
}

const DEFAULT_CONFIG: ExtConfig = {
    'info': 'this file is auto-generated by the extension. You can edit/delete it to change default values for branch names and git/bash executable paths.',
    'main-branch-name': 'main',
    'local-branch-name': 'temporary-branch',
    'git-exe': 'C:\\Program Files\\Git\\cmd\\git.exe',
    'bash-exe': 'C:\\Program Files\\Git\\bin\\bash.exe',
};

function getConfigPath(workspacePath: string): string {
    return path.join(workspacePath, '.git-extension-wrap', 'configuration.json');
}

function loadOrCreateConfig(workspacePath: string): ExtConfig {
    const configPath = getConfigPath(workspacePath);
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    if (!fs.existsSync(configPath)) {
        fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 4), 'utf8');
        return { ...DEFAULT_CONFIG };
    }
    try {
        return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
    } catch (err) {
        logError(workspacePath, 'loadOrCreateConfig', err);
        return { ...DEFAULT_CONFIG };
    }
}

function saveConfig(workspacePath: string, key: string, value: string): void {
    const configPath = getConfigPath(workspacePath);
    const config = loadOrCreateConfig(workspacePath);
    (config as unknown as Record<string, string>)[key] = value;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 4), 'utf8');
}

// ── webview HTML ──────────────────────────────────────────────────────────────

function getWebviewContent(webview: vscode.Webview, extensionUri: vscode.Uri, config: ExtConfig): string {
    const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, '/src/ui_panel', 'panel.css'));
    const jsUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, '/src/ui_panel', 'panel.js'));
    const htmlPath = path.join(extensionUri.fsPath, '/src/ui_panel', 'panel.html');

    return fs.readFileSync(htmlPath, 'utf8')
        .replace('{{cssUri}}', cssUri.toString())
        .replace('{{jsUri}}', jsUri.toString())
        .replace(/\{\{cspSource\}\}/g, webview.cspSource)
        .replace('{{mainBranchName}}', config['main-branch-name'])
        .replace('{{localBranchName}}', config['local-branch-name']);
}

export function deactivate() { }
