import * as vscode from 'vscode';
import { spawn, ChildProcess, execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { randomUUID } from 'crypto';

function findModalPath(filePath?: string): string | null {
	const configPath = vscode.workspace.getConfiguration('modal-run').get<string>('modalPath');
	if (configPath && fs.existsSync(configPath)) {
		return configPath;
	}

	if (filePath) {
		const fileDir = path.dirname(filePath);
		const localVenv = path.join(fileDir, '.venv', 'bin', 'modal');
		if (fs.existsSync(localVenv)) {
			return localVenv;
		}
	}

	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (workspaceRoot) {
		const venvPath = path.join(workspaceRoot, '.venv', 'bin', 'modal');
		if (fs.existsSync(venvPath)) {
			return venvPath;
		}
	}

	const homeDir = process.env.HOME || '';
	const commonPaths = [
		path.join(homeDir, '.local', 'bin', 'modal'),
		'/usr/local/bin/modal',
		'/opt/homebrew/bin/modal',
	];
	for (const p of commonPaths) {
		if (fs.existsSync(p)) {
			return p;
		}
	}

	try {
		const result = execSync('which modal', { encoding: 'utf8', shell: '/bin/zsh' }).trim();
		if (result && fs.existsSync(result)) {
			return result;
		}
	} catch { }

	return null;
}

let rustProcess: ChildProcess | null = null;
let requestsMap = new Map<string, (reponse: any) => void>()

const runTimestampAgeThreshold = 6 * 60 * 60 * 1000
const runFunctionCommand = "modal-run.runEntrypoint"
const openURLCommand = "modal-run.dashboard-url"
const modalURLRegex = /https:\/\/modal\.com\/apps\/[^\s]+/

type runStatus = {
	modalRunURL: string;
	runStatus: string | 'succcess' | 'failure' | 'running';
	runTimestamp?: Date;
}

const runStatus = new Map<string, runStatus>(); // keeps function's run status state


function getBinaryPath(context: vscode.ExtensionContext): string {
	const platform = process.platform;
	const binaryName = platform === 'win32' ? 'backend.exe' : 'backend';

	const bundledPath = path.join(context.extensionPath, 'bin', binaryName);
	if (fs.existsSync(bundledPath)) {
		return bundledPath;
	}

	const devPath = path.join(
		context.extensionPath,
		'..', '..', 'backend', 'target', 'debug', 'backend'
	);
	if (fs.existsSync(devPath)) {
		return devPath;
	}

	throw new Error(`Backend binary not found. Checked:\n- ${bundledPath}\n- ${devPath}`);
}

export function activate(context: vscode.ExtensionContext) {
	console.log('Extension activated');
	if (rustProcess) {
		vscode.window.showWarningMessage('Rust process already running');
		return;
	}

	let binaryPath: string;
	try {
		binaryPath = getBinaryPath(context);
	} catch (err: any) {
		vscode.window.showErrorMessage(`Modal Runner: ${err.message}`);
		return;
	}

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
	vscode.commands.registerCommand(runFunctionCommand,
		async (filePath: string, functionName: string) => {
			console.log('1. Command triggered:', functionName);
			console.log('2. Status set to running');
			console.log('3. refresh() called');
			const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
			if (!workspaceRoot) {
				console.log("Workspace not found")
				return
			}

			outputChannel.show();
			outputChannel.appendLine(`Running: modal run ${filePath}::${functionName}`);
			outputChannel.appendLine('---');

			let runURL = ""

			runStatus.set(functionName, { runStatus: 'running', modalRunURL: '', runTimestamp: new Date() })
			// Keep refreshing every 500ms before the modal function returns.
			// Otherwise, the runStatus will not update to 'running', due to the refresh event being queued.   
			// setInterval fixes this because it retries, ensuring that a single refresh() does not get batched (theory from Claude).
			const refreshInterval = setInterval(() => {
				console.log('Interval refresh');
				provider.refresh();
			}, 500);

			const { spawn } = require('child_process');
			const modalPath = findModalPath(filePath);
			if (!modalPath) {
				vscode.window.showErrorMessage(
					'Modal CLI not found. Install modal or set path in Settings > Modal Run.',
					'Open Settings'
				).then(selection => {
					if (selection === 'Open Settings') {
						vscode.commands.executeCommand('workbench.action.openSettings', 'modal-run.modalPath');
					}
				});
				return;
			}
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

				const now = new Date();
				runStatus.set(functionName, { runStatus: 'failed', modalRunURL: runURL, runTimestamp: now })

				outputChannel.append(data.toString());
			});

			proc.on('error', (err: Error) => {
				clearInterval(refreshInterval);

				outputChannel.appendLine(`Error: ${err.message}`);
			});

			proc.on('close', (code: number) => {
				clearInterval(refreshInterval);
				const now = new Date();
				if (code == 0) {
					runStatus.set(functionName, { runStatus: 'succeeded', modalRunURL: runURL, runTimestamp: now })
				} else {
					runStatus.set(functionName, { runStatus: 'failed', modalRunURL: '', runTimestamp: now })
				}
				provider.refresh()


				outputChannel.appendLine(`\nExited with code ${code}`);
			});
		}
	);

	vscode.commands.registerCommand(openURLCommand, (status: runStatus) => {
		console.log('Opening dashboard:', status.modalRunURL);
		if (status.modalRunURL) {
			vscode.env.openExternal(vscode.Uri.parse(status.modalRunURL));
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
	private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
	readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

	refresh() {
		console.log('4. Inside refresh(), firing event');
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
				command: runFunctionCommand,
				arguments: [document.uri.fsPath, f.name]
			});
			codeLenses.push(lens);


			const status = runStatus.get(f.name)
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
		})

		return codeLenses

	}

}

function formatRunStatus(status: runStatus): string {
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

function getTimeAgo(date: Date | undefined): string {
	if (!date) {
		return ""
	}
	const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);

	if (seconds < 60) return `${seconds}s ago`;
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
	return `${Math.floor(seconds / 86400)}d ago`;
}

export function deactivate() {
	if (rustProcess) {
		rustProcess.kill();
		rustProcess = null;
	}
}

