// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
let rustProcess: ChildProcess | null = null;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	console.log('Extension activated');
	context.subscriptions.push(
		vscode.languages.registerCodeLensProvider(
			{ language: 'python' },
			new ModalCodeLensProvider()
		)
	);
	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	if (rustProcess) {
		vscode.window.showWarningMessage('Rust process already running');
		return;
	}
	// Path to the Rust binary (adjust based on your build location)
	const binaryPath = path.join(
		context.extensionPath,
		'..', '..', '..', 'runner', 'backend', 'target', 'debug', 'backend'
	);

	rustProcess = spawn(binaryPath);
	rustProcess.stdout?.on('data', (data: Buffer) => {
		const response = data.toString().trim();
		console.log('Received from Rust:', response);
		vscode.window.showInformationMessage(`Rust says: ${response}`);
	});

	rustProcess.stderr?.on('data', (data: Buffer) => {
		console.error('Rust error:', data.toString());
	});

	rustProcess.on('close', (code) => {
		console.log(`Rust process exited with code ${code}`);
		rustProcess = null;
	});

}

// This method is called when your extension is deactivated
export function deactivate() {
	if (rustProcess) {
		rustProcess.kill();
		rustProcess = null;
	}
}

class ModalCodeLensProvider implements vscode.CodeLensProvider {
	provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
		if (!rustProcess || !rustProcess.stdin) {
			console.log("Rustprocess nil", rustProcess)
			return []
		}


		let command = { command: "parse", file: document.uri.fsPath }
		rustProcess.stdin.write(JSON.stringify(command))


		const codeLenses: vscode.CodeLens[] = [];

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
		return codeLenses

	}

}