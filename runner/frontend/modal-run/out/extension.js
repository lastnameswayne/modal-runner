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
let rustProcess = null;
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
function activate(context) {
    console.log('Extension activated');
    context.subscriptions.push(vscode.languages.registerCodeLensProvider({ language: 'python' }, new ModalCodeLensProvider()));
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    if (rustProcess) {
        vscode.window.showWarningMessage('Rust process already running');
        return;
    }
    // Path to the Rust binary (adjust based on your build location)
    const binaryPath = path.join(context.extensionPath, '..', '..', '..', 'runner', 'backend', 'target', 'debug', 'backend');
    console.log("BINARY PATH", binaryPath);
    rustProcess = (0, child_process_1.spawn)(binaryPath);
    rustProcess.stdout?.on('data', (data) => {
        const response = data.toString().trim();
        console.log('Received from Rust:', response);
        vscode.window.showInformationMessage(`Rust says: ${response}`);
    });
    rustProcess.stderr?.on('data', (data) => {
        console.error('Rust error:', data.toString());
    });
    rustProcess.on('close', (code) => {
        console.log(`Rust process exited with code ${code}`);
        rustProcess = null;
    });
}
// This method is called when your extension is deactivated
function deactivate() {
    if (rustProcess) {
        rustProcess.kill();
        rustProcess = null;
    }
}
class ModalCodeLensProvider {
    provideCodeLenses(document) {
        if (!rustProcess || !rustProcess.stdin) {
            console.log("Rustprocess nil", rustProcess);
            return [];
        }
        let command = { command: "parse", file: document.uri.fsPath };
        rustProcess.stdin.write(JSON.stringify(command));
        const codeLenses = [];
        const text = document.getText();
        const lines = text.split('\n');
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes('@app.local_entrypoint()')) {
                const range = new vscode.Range(i, 0, i, 0);
                const lens = new vscode.CodeLens(range, {
                    title: '▶ Run',
                    command: 'modal-run.runEntrypoint',
                    arguments: [document.uri, i]
                });
                codeLenses.push(lens);
            }
        }
        return codeLenses;
    }
}
//# sourceMappingURL=extension.js.map