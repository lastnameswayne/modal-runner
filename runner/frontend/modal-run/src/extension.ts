// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { randomUUID } from 'crypto';
let rustProcess: ChildProcess | null = null;
let requestsMap = new Map<string, (reponse: any) => void>()


type runStatus = {
	modalRunID: string;
	runStatus: string | 'succcess' | 'failure' | 'running';
}

const runStatus = new Map<string, runStatus>(); // keeps function's run status state
const runID = new Map<string, string>();

const modalURLRegex = /https:\/\/modal\.com\/apps\/[^\s]+/
type ModalFunction = {
	filename: string;
	function: string;
	isEntrypoint: string;
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	console.log('Extension activated');
	if (rustProcess) {
		vscode.window.showWarningMessage('Rust process already running');
		return;
	}
	const binaryPath = path.join(
		context.extensionPath,
		'..', '..', '..', 'runner', 'backend', 'target', 'debug', 'backend'
	);
	rustProcess = spawn(binaryPath);

	rustProcess.stdout?.on('data', (data) => {
		const response = JSON.parse(data)
		console.log("got response", response)
		const resolve = requestsMap.get(response.id)
		if (resolve) {
			requestsMap.delete(response.id)
			resolve(response)
		}
	})

	rustProcess.stderr?.on('data', (data: Buffer) => {
		console.error('Rust error:', data.toString());
	});

	rustProcess.on('close', (code) => {
		console.log(`Rust process exited with code ${code}`);
		rustProcess = null;
	});
	const outputChannel = vscode.window.createOutputChannel('Modal');
	const provider = new ModalCodeLensProvider();
	vscode.commands.registerCommand('modal-run.runEntrypoint',
		async (filePath: string, functionName: string) => {
			runStatus.set(functionName, { runStatus: 'running', modalRunID: '' })
			provider.refresh()
			const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			if (!workspaceRoot) {
				console.log("Workspace not found")
				return
			}
			const modalPath = path.join(workspaceRoot, '.venv', 'bin', 'modal');



			outputChannel.show();
			outputChannel.appendLine(`Running: modal run ${filePath}::${functionName}`);
			outputChannel.appendLine('---');

			let runURL = ""

			const { spawn } = require('child_process');
			const proc = spawn(modalPath, ['run', `${filePath}::${functionName}`], {
				shell: true
			});

			proc.stdout.on('data', (data: Buffer) => {
				const text = data.toString()
				const urlMatch = text.match(modalURLRegex)
				if (urlMatch) {
					runURL = urlMatch[0]
				}

				outputChannel.append(data.toString());
			});

			proc.stderr.on('data', (data: Buffer) => {
				const text = data.toString()
				const urlMatch = text.match(modalURLRegex)
				if (urlMatch) {
					runURL = urlMatch[0]
				}

				outputChannel.append(data.toString());
			});

			proc.on('error', (err: Error) => {
				runStatus.set(functionName, { runStatus: 'failed', modalRunID: runURL })
				provider.refresh()

				outputChannel.appendLine(`Error: ${err.message}`);
			});

			proc.on('close', (code: number) => {
				runStatus.set(functionName, { runStatus: 'succeeded', modalRunID: runURL })
				provider.refresh()

				outputChannel.appendLine(`\nExited with code ${code}`);
			});
		}
	);

	vscode.commands.registerCommand('modal-run.dashboard-url', (status: runStatus) => {
		console.log('Opening dashboard:', status.modalRunID);
		if (status.modalRunID) {
			vscode.env.openExternal(vscode.Uri.parse(status.modalRunID));
		}
	})

	context.subscriptions.push(
		vscode.languages.registerCodeLensProvider(
			{ language: 'python' },
			provider
		)
	);
}
function request(command: any): Promise<any> {
	return new Promise((resolve, reject) => {
		if (!rustProcess || !rustProcess.stdin) {
			console.log("Rustprocess nil", rustProcess)
			return []
		}

		console.log("writing request to rust", JSON.stringify(command))
		rustProcess?.stdin?.write(JSON.stringify(command) + "\n")
		requestsMap.set(command.id, resolve)
		return
	})

}

class ModalCodeLensProvider implements vscode.CodeLensProvider {
	// Add event emitter to refresh CodeLens
	private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
	readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

	refresh() {
		this._onDidChangeCodeLenses.fire()
	}


	async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
		if (!rustProcess || !rustProcess.stdin) {
			console.log("Rustprocess nil", rustProcess)
			return []
		}

		const codeLenses: vscode.CodeLens[] = [];

		let command = { command: "parse", file: document.uri.fsPath, id: randomUUID() }
		let res = await request(command)
		res.functions.forEach((f: any) => {
			let line = f.line - 1
			const range = new vscode.Range(line, 0, line, 0);
			const lens = new vscode.CodeLens(range, {
				title: `▶ Run`,
				command: 'modal-run.runEntrypoint',
				arguments: [document.uri.fsPath, f.name]
			});
			codeLenses.push(lens);

			const status = runStatus.get(f.name)
			if (status) {
				const lens = new vscode.CodeLens(range, {
					title: `${status.runStatus} ${status.modalRunID}`,
					command: 'modal-run.dashboard-url',
					arguments: [status]
				});
				codeLenses.push(lens);
			}
		})

		return codeLenses

	}

}

// This method is called when your extension is deactivated
export function deactivate() {
	if (rustProcess) {
		rustProcess.kill();
		rustProcess = null;
	}
}

