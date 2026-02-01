// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { randomUUID } from 'crypto';
let rustProcess: ChildProcess | null = null;
let requestsMap = new Map<string, (reponse: any) => void>()

type FileParseRequest = {

}

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

	let disposable = vscode.commands.registerCommand('modal-run.runEntrypoint', () => {
		vscode.window.showInformationMessage("hit run")

	})

	context.subscriptions.push(
		vscode.languages.registerCodeLensProvider(
			{ language: 'python' },
			new ModalCodeLensProvider()
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
	async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
		if (!rustProcess || !rustProcess.stdin) {
			console.log("Rustprocess nil", rustProcess)
			return []
		}

		const codeLenses: vscode.CodeLens[] = [];

		let command = { command: "parse", file: document.uri.fsPath, id: randomUUID() }
		let res = await request(command)
		console.log(res.functions)
		res.functions.forEach((f: any) => {
			let line = f.line
			console.log(f)
			const range = new vscode.Range(line, 0, line, 0);
			const lens = new vscode.CodeLens(range, {
				title: '▶ Run',
				command: 'modal-run.runEntrypoint',
				arguments: [document.uri, line]
			});
			codeLenses.push(lens);
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

