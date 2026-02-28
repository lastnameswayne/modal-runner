import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import { findModalPath, getBinaryPath } from './binarypaths';

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


export function activate(context: vscode.ExtensionContext) {
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
		const resolve = requestsMap.get(response.id)
		if (resolve) {
			requestsMap.delete(response.id)
			resolve(response)
		}
	})

	rustProcess.stderr?.on('data', (data: Buffer) => {
		console.error('Rust error:', data.toString());
	});

	rustProcess.on('close', () => {
		rustProcess = null;
	});

	const outputChannel = vscode.window.createOutputChannel('Modal-Runner');
	const provider = new ModalCodeLensProvider();
	vscode.commands.registerCommand(runFunctionCommand,
		async (filePath: string, functionName: string, params: any[]) => {
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

			const paramArgs = await promptParams(params);
			if (paramArgs === undefined) {
				return; // user pressed Escape
			}

			outputChannel.clear();
			outputChannel.show();
			const fullCommand = `modal run ${filePath}::${functionName}${paramArgs.length ? ' ' + paramArgs.join(' ') : ''}`;
			outputChannel.appendLine(`Running: ${fullCommand}`);
			outputChannel.appendLine('---');


			runStatus.set(functionName, { runStatus: 'running', modalRunURL: '', runTimestamp: new Date() })
			const refreshInterval = setInterval(() => {
				provider.refresh();
			}, 500);

			const proc = spawn(modalPath, ['run', `${filePath}::${functionName}`, ...paramArgs]);

			let runURL = ""
			proc.stdout.on('data', (data: Buffer) => {
				const text = data.toString()
				const urlMatch = text.match(modalURLRegex)
				if (urlMatch) {
					runURL = urlMatch[0]
				}
				outputChannel.append(text);
				outputChannel.show(true);
			});
			proc.stderr.on('data', (data: Buffer) => {
				const text = data.toString()
				const urlMatch = text.match(modalURLRegex)
				if (urlMatch) {
					runURL = urlMatch[0]
				}
				outputChannel.append(text);
				outputChannel.show(true);
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
		if (status.modalRunURL) {
			vscode.env.openExternal(vscode.Uri.parse(status.modalRunURL));
		}
	})

	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument((e) => {
			if (e.document.languageId === 'python') {
				provider.refresh();
			}
		})
	);

	context.subscriptions.push(
		vscode.languages.registerCodeLensProvider(
			{ language: 'python' },
			provider
		)
	);
}

async function promptParams(params: any[]): Promise<string[] | undefined> {
	const paramArgs: string[] = [];
	for (const param of params) {
		const label = param.param_type
			? `${param.name} (${param.param_type}${param.default ? ', default: ' + param.default : ''})`
			: param.name;
		const value = await vscode.window.showInputBox({
			prompt: `Enter value for '${label}'`,
			value: param.default || '',
			placeHolder: param.param_type || 'value',
		});
		if (value === undefined) {
			return undefined; // user pressed Escape
		}
		if (value !== '') {
			paramArgs.push(`--${param.name.replaceAll('_', '-')}`, value);
		}
	}
	return paramArgs;
}

function request(command: any): Promise<any> {
	return new Promise((resolve, reject) => {
		if (!rustProcess || !rustProcess.stdin) {
			return []
		}

		rustProcess?.stdin?.write(JSON.stringify(command) + "\n")
		requestsMap.set(command.id, resolve)
		return
	})

}

class ModalCodeLensProvider implements vscode.CodeLensProvider {
	private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
	readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

	refresh() {
		this._onDidChangeCodeLenses.fire()
	}


	async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
		if (!rustProcess || !rustProcess.stdin) {
			return []
		}
		const codeLenses: vscode.CodeLens[] = [];

		let command = { command: "parse", file: document.uri.fsPath, id: randomUUID() }
		let res = await request(command)
		if (res.error) {
			console.error('Backend error:', res.error);
			return [];
		}
		res.functions.forEach((f: any) => {
			let line = f.line - 1
			const range = new vscode.Range(line, 0, line, 0);
			const lens = new vscode.CodeLens(range, {
				title: `▶ Run`,
				command: runFunctionCommand,
				arguments: [document.uri.fsPath, f.name, f.params || []]
			});
			codeLenses.push(lens);


			const status = runStatus.get(f.name)
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

