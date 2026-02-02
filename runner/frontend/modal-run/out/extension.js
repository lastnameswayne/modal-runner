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
    vscode.commands.registerCommand('modal-run.runEntrypoint', async (filePath, functionName) => {
        const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        if (!workspaceRoot) {
            console.log("Workspace not found");
            return;
        }
        const modalPath = path.join(workspaceRoot, '.venv', 'bin', 'modal');
        outputChannel.show();
        outputChannel.appendLine(`Running: modal run ${filePath}::${functionName}`);
        outputChannel.appendLine('---');
        const { spawn } = require('child_process');
        const proc = spawn(modalPath, ['run', `${filePath}::${functionName}`], {
            shell: true
        });
        proc.stdout.on('data', (data) => {
            outputChannel.append(data.toString());
        });
        proc.stderr.on('data', (data) => {
            outputChannel.append(data.toString());
        });
        proc.on('error', (err) => {
            outputChannel.appendLine(`Error: ${err.message}`);
        });
        proc.on('close', (code) => {
            outputChannel.appendLine(`\nExited with code ${code}`);
        });
    });
    context.subscriptions.push(vscode.languages.registerCodeLensProvider({ language: 'python' }, new ModalCodeLensProvider()));
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
    async provideCodeLenses(document) {
        if (!rustProcess || !rustProcess.stdin) {
            console.log("Rustprocess nil", rustProcess);
            return [];
        }
        const codeLenses = [];
        let command = { command: "parse", file: document.uri.fsPath, id: (0, crypto_1.randomUUID)() };
        let res = await request(command);
        res.functions.forEach((f) => {
            let line = f.line - 1;
            const range = new vscode.Range(line, 0, line, 0);
            const lens = new vscode.CodeLens(range, {
                title: '▶ Run',
                command: 'modal-run.runEntrypoint',
                arguments: [document.uri.fsPath, f.name]
            });
            codeLenses.push(lens);
        });
        return codeLenses;
    }
}
// This method is called when your extension is deactivated
function deactivate() {
    if (rustProcess) {
        rustProcess.kill();
        rustProcess = null;
    }
}
//# sourceMappingURL=extension.js.map