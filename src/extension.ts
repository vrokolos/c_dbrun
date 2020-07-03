import * as vscode from 'vscode';
import { DBRun, DbRunOptions } from "./dbrun";
export function activate(context: vscode.ExtensionContext) {
	let _outputChannel = vscode.window.createOutputChannel("dbrun");
	let currentQuery = vscode.commands.registerCommand('dbrun.currentQuery', () => go(_outputChannel, { kind: 1 }));
	let describeObject = vscode.commands.registerCommand('dbrun.describeObject', () => go(_outputChannel, { kind: 2 }));
	let executeFile = vscode.commands.registerCommand('dbrun.executeFile', () => go(_outputChannel, { kind: 0 }));
	let currentQueryNW = vscode.commands.registerCommand('dbrun.currentQueryNewWindow', () => go(_outputChannel, { kind: 1, newwindow: true }));
	let rrun = vscode.commands.registerCommand('dbrun.run', (opt: ExtOptions) => go(_outputChannel, opt));

	context.subscriptions.push(rrun);
	context.subscriptions.push(executeFile);
	context.subscriptions.push(describeObject);
	context.subscriptions.push(currentQuery);
	context.subscriptions.push(currentQueryNW);
}

let db = new DBRun();

function changeLogLang() {
	for (const editor of vscode.window.visibleTextEditors) {
		console.log(editor.document.fileName);
		if (editor.document.fileName.startsWith('extension-output-')) {
			if (editor.document.lineAt(0).text.startsWith("dbrun")) {
				console.log("dbrun");
				vscode.languages.setTextDocumentLanguage(editor.document, 'dbrun');
			} else {
				console.log("not dbrun");
				vscode.languages.setTextDocumentLanguage(editor.document, 'Log');
			}
		}
	}
}

async function go(_outputChannel: vscode.OutputChannel, options: ExtOptions) {
	let kind = options?.kind ?? 0;
	let nw = options?.newwindow ?? false;

	if (!nw) {
		_outputChannel.clear();
	}
	_outputChannel.show(true);

	const editor = vscode.window.activeTextEditor;
	if (editor && editor?.document) {
		let _document = editor.document;
		let ttext = _document.getText();
		let lineNumber = 0;
		let colNumber = 0;
		if (kind === 1) {
			lineNumber = editor.selection.active.line + 1;
		} else if (kind === 2) {
			lineNumber = editor.selection.active.line + 1;
			colNumber = editor.selection.active.character + 1;
		}

		let conf = vscode.workspace.getConfiguration('dbrun');
		let con = conf.get<string>('connection') ?? "";
		let lim = conf.get<number>('rowLimit') ?? 10;
		let limit = lim ?? (nw ? 50 : 10);

		db.extraLog = data => _outputChannel.appendLine(data.toString());

		let doptions = new DbRunOptions();
		doptions.fileText = ttext;
		doptions.connectionString = con;
		doptions.currentLine = lineNumber;
		doptions.currentCol = colNumber;
		doptions.rowLimit = limit;
		doptions.format = options?.format ?? "text";
		doptions.eol = editor.document.eol === vscode.EndOfLine.LF ? "\n" : "\r\n";

		let output = await db.go(doptions);
		if (output.errorPosition) {
			let newPosition = new vscode.Position(output.errorPosition.line - 1, output.errorPosition.col);
			editor.selection = new vscode.Selection(newPosition, newPosition);
			editor.revealRange(new vscode.Range(newPosition, newPosition));
		}

		for (let ddl of Object.keys(output.files)) {
			await showText(ddl + ".sql", output.files[ddl].join(doptions.eol));
		}

		if (output.output !== "") {
			if (nw) {
				let filename = "qr" + (Math.random().toString(36).replace(/[^a-z]+/g, "").substr(0, 10)) + ((options?.format ?? "text") === "text" ? ".txt" : ".csv");
				await showText(filename, output.output);
			} else {
				_outputChannel.appendLine(output.output);
			}
		}
		setTimeout(() => changeLogLang(), 1000);
	}
}

async function showText(title: string, output: string) {
	let textdoc = await vscode.workspace.openTextDocument(vscode.Uri.parse(`untitled:${title}`));
	let textshow = await vscode.window.showTextDocument(textdoc, { preview: true, preserveFocus: true, viewColumn: vscode.ViewColumn.Beside });
	let firstLine = textshow.document.lineAt(0);
	let lastLine = textshow.document.lineAt(textshow.document.lineCount - 1);
	let textRange = new vscode.Range(firstLine.range.start, lastLine.range.end);
	textshow.edit(edit => edit.replace(textRange, output));
	let newPosition = new vscode.Position(0, 0);
	textshow.selection = new vscode.Selection(newPosition, newPosition);
}

export function deactivate() { }

export class ExtOptions {
	kind?: number = 0;
	newwindow?: boolean = false;
	format?: string = "text";
}