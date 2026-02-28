import * as vscode from 'vscode';
import { execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export function findModalPath(filePath?: string): string | null {
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

export function getBinaryPath(context: vscode.ExtensionContext): string {
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
