"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const crypto_1 = require("crypto");
let rustProcess = null;
let requestsMap = new Map();
const runTimestampAgeThreshold = 6 * 60 * 60 * 1000;
const runFunctionCommand = "modal-run.runEntrypoint";
const openURLCommand = "modal-run.dashboard-url";
const modalURLRegex = /https:\/\/modal\.com\/apps\/[^\s]+/;
const runStatus = new Map(); // keeps function's run status state
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
function activate(context) {
    console.log('Extension activated');
    if (rustProcess) {
        vscode.window.showWarningMessage('Rust process already running');
        return;
    }
    const binaryPath = path.join(context.extensionPath, '..', '..', '..', 'runner', 'backend', 'target', 'debug', 'backend');
    rustProcess = (0, child_process_1.spawn)(binaryPath);
    rustProcess.stdout?.on('data', (data) => {
        const response = JSON.parse(data);
        console.log("got response", response);
        const resolve = requestsMap.get(response.id);
        if (resolve) {
            requestsMap.delete(response.id);
            resolve(response);
        }
    });
    rustProcess.stderr?.on('data', (data) => {
        console.error('Rust error:', data.toString());
    });
    rustProcess.on('close', (code) => {
        console.log(`Rust process exited with code ${code}`);
        rustProcess = null;
    });
    const outputChannel = vscode.window.createOutputChannel('Modal');
    const provider = new ModalCodeLensProvider();
    vscode.commands.registerCommand(runFunctionCommand, async (filePath, functionName) => {
        console.log('1. Command triggered:', functionName);
        console.log('2. Status set to running');
        console.log('3. refresh() called');
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            console.log("Workspace not found");
            return;
        }
        outputChannel.show();
        outputChannel.appendLine(`Running: modal run ${filePath}::${functionName}`);
        outputChannel.appendLine('---');
        let runURL = "";
        runStatus.set(functionName, { runStatus: 'running', modalRunURL: '', runTimestamp: new Date() });
        // Keep refreshing every 500ms before the modal function returns.
        // Otherwise, the runStatus will not update to 'running', due to the refresh event being queued.   
        const refreshInterval = setInterval(() => {
            console.log('Interval refresh');
            provider.refresh();
        }, 500);
        const { spawn } = require('child_process');
        const modalPath = path.join(workspaceRoot, '.venv', 'bin', 'modal');
        const proc = spawn(modalPath, ['run', `${filePath}::${functionName}`], {
            shell: true
        });
        proc.stdout.on('data', (data) => {
            const text = data.toString();
            const urlMatch = text.match(modalURLRegex);
            if (urlMatch) {
                runURL = urlMatch[0];
            }
            outputChannel.append(data.toString());
        });
        proc.stderr.on('data', (data) => {
            const text = data.toString();
            const urlMatch = text.match(modalURLRegex);
            if (urlMatch) {
                runURL = urlMatch[0];
            }
            const now = new Date();
            runStatus.set(functionName, { runStatus: 'failed', modalRunURL: runURL, runTimestamp: now });
            outputChannel.append(data.toString());
        });
        proc.on('error', (err) => {
            clearInterval(refreshInterval);
            outputChannel.appendLine(`Error: ${err.message}`);
        });
        proc.on('close', (code) => {
            clearInterval(refreshInterval);
            const now = new Date();
            if (code == 0) {
                runStatus.set(functionName, { runStatus: 'succeeded', modalRunURL: runURL, runTimestamp: now });
            }
            else {
                runStatus.set(functionName, { runStatus: 'failed', modalRunURL: '', runTimestamp: now });
            }
            provider.refresh();
            outputChannel.appendLine(`\nExited with code ${code}`);
        });
    });
    vscode.commands.registerCommand(openURLCommand, (status) => {
        console.log('Opening dashboard:', status.modalRunURL);
        if (status.modalRunURL) {
            vscode.env.openExternal(vscode.Uri.parse(status.modalRunURL));
        }
    });
    context.subscriptions.push(vscode.languages.registerCodeLensProvider({ language: 'python' }, provider));
}
function request(command) {
    return new Promise((resolve, reject) => {
        if (!rustProcess || !rustProcess.stdin) {
            console.log("Rustprocess nil", rustProcess);
            return [];
        }
        console.log("writing request to rust", JSON.stringify(command));
        rustProcess?.stdin?.write(JSON.stringify(command) + "\n");
        requestsMap.set(command.id, resolve);
        return;
    });
}
class ModalCodeLensProvider {
    // Add event emitter to refresh CodeLens
    _onDidChangeCodeLenses = new vscode.EventEmitter();
    onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
    refresh() {
        console.log('4. Inside refresh(), firing event');
        this._onDidChangeCodeLenses.fire();
    }
    async provideCodeLenses(document) {
        if (!rustProcess || !rustProcess.stdin) {
            console.log("Rustprocess nil", rustProcess);
            return [];
        }
        console.log("5. provideCodeLenses called");
        const codeLenses = [];
        let command = { command: "parse", file: document.uri.fsPath, id: (0, crypto_1.randomUUID)() };
        let res = await request(command);
        res.functions.forEach((f) => {
            let line = f.line - 1;
            const range = new vscode.Range(line, 0, line, 0);
            const lens = new vscode.CodeLens(range, {
                title: `▶ Run`,
                command: runFunctionCommand,
                arguments: [document.uri.fsPath, f.name]
            });
            codeLenses.push(lens);
            const status = runStatus.get(f.name);
            console.log(`6. Status for ${f.name}:`, status);
            if (!status?.runTimestamp) {
                return;
            }
            const timeSinceLastRun = Math.floor((new Date().getTime() - status.runTimestamp.getTime()));
            if (status && timeSinceLastRun && timeSinceLastRun < runTimestampAgeThreshold) {
                const lens = new vscode.CodeLens(range, {
                    title: `${formatRunStatus(status)}`,
                    command: openURLCommand,
                    arguments: [status]
                });
                codeLenses.push(lens);
            }
        });
        return codeLenses;
    }
}
function formatRunStatus(status) {
    const timeAgo = getTimeAgo(status.runTimestamp);
    switch (status.runStatus) {
        case 'running':
            return `⏳ Running...`;
        case 'succeeded':
            return `✓ Completed (${timeAgo}) | ${status.modalRunURL}`;
        case 'failed':
            return `✗ Failed (${timeAgo})`;
        default:
            return status.runStatus;
    }
}
function getTimeAgo(date) {
    if (!date) {
        return "";
    }
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60)
        return `${seconds}s ago`;
    if (seconds < 3600)
        return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400)
        return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}
// This method is called when your extension is deactivated
function deactivate() {
    if (rustProcess) {
        rustProcess.kill();
        rustProcess = null;
    }
}
//# sourceMappingURL=extension.js.map