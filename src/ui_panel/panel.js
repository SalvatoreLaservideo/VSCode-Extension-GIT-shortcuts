const js_running = document.createElement("div");
js_running.className = "js-running-check-ok";
js_running.innerText = "js ✓";
document.body.appendChild(js_running);

const vscode = acquireVsCodeApi();

const buttonCommands = {
    'status-btn': 'status',
    'log-btn': 'log',
    'branch-btn': 'branch',
    'add-png-btn': 'addPng',
    'add-svg-btn': 'addSvg',
    'add-jpeg-btn': 'addJpeg',
    'rebase-interactive-btn': 'rebaseInteractive',
    'reset-hard-btn': 'resetHard',
    'pull-btn': 'pull',
    'push-btn': 'push',
    'reset-hard-push-btn': 'resetHardPush',
    'cherry-pick-btn': 'cherryPick',
};

for (const [id, command] of Object.entries(buttonCommands)) {
    const button = document.getElementById(id);
    if (button) {
        button.addEventListener('click', () => {
            vscode.postMessage({ command });
        });
    }
}

const branchCommands = {
    'branch-delete-btn': 'branchDelete',
    'checkout-new-btn': 'checkoutNew',
    'checkout-btn': 'checkout',
    'log-to-file-btn': 'logToFile',
};

function setupSaveButton(btnId, inputId, configKey) {
    const btn = document.getElementById(btnId);
    const input = document.getElementById(inputId);
    if (!btn || !input) { return; }

    let savedValue = input.value;
    btn.style.visibility = 'hidden';

    input.addEventListener('keyup', () => {
        btn.style.visibility = input.value.trim() !== savedValue ? 'visible' : 'hidden';
    });

    btn.addEventListener('click', () => {
        const value = input.value;
        vscode.postMessage({ command: 'saveConfig', key: configKey, value });
        savedValue = value;
        btn.style.visibility = 'hidden';
        btn.classList.add('saved');
        setTimeout(() => btn.classList.remove('saved'), 1500);
    });
}

setupSaveButton('save-main-branch-btn', 'main-branch-name', 'main-branch-name');
setupSaveButton('save-branch-btn', 'branch-name', 'local-branch-name');

const mainBranchCommands = {
    'main-log-to-file-btn': 'mainLogToFile',
    'main-checkout-btn': 'mainCheckout',
};

for (const [id, command] of Object.entries(mainBranchCommands)) {
    const button = document.getElementById(id);
    if (button) {
        button.addEventListener('click', () => {
            const branchName = document.getElementById('main-branch-name').value;
            vscode.postMessage({ command, branchName });
        });
    }
}
for (const [id, command] of Object.entries(branchCommands)) {
    const button = document.getElementById(id);
    if (button) {
        button.addEventListener('click', () => {
            const branchName = document.getElementById('branch-name').value;

            vscode.postMessage({ command, branchName });
        });
    }
}
