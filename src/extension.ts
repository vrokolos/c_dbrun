import * as vscode from 'vscode';
import { DBRun, DbRunOptions } from "./dbrun";
import { SqlAutoComplete } from "./autocomplete";

let db = new DBRun();

let stIcon: vscode.StatusBarItem | null = null;
let currCon: string | null = null;
let currName: string = "dbrun";

export function activate(context: vscode.ExtensionContext) {
	let _outputChannel = vscode.window.createOutputChannel("dbrun");
	stIcon = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 1000);
	stIcon.text = "conn1";
	stIcon.command = "dbrun.chooseConnection";
	stIcon.show();


	let commands: { [command: string]: any } = {
		'dbrun.currentQuery': () => go(_outputChannel, { kind: 1 }),
		'dbrun.describeObject': () => go(_outputChannel, { kind: 2 }),
		'dbrun.executeFile': () => go(_outputChannel, { kind: 0 }),
		'dbrun.chooseConnection': () => chooseConn(),
		'dbrun.reconnect': () => dbConnect(),
		'dbrun.currentQueryNewWindow': () => go(_outputChannel, { kind: 1, newwindow: true }),
		'dbrun.currentQueryNewWindowInsert': () => go(_outputChannel, { kind: 1, newwindow: true, format: 'insert' }),
		'dbrun.currentQueryNewWindowCSV': () => go(_outputChannel, { kind: 1, newwindow: true, format: 'csv' }),
		'dbrun.run': (opt: ExtOptions) => go(_outputChannel, opt)
	};

	for (let command of Object.keys(commands)) {
		context.subscriptions.push(vscode.commands.registerCommand(command, commands[command]));
	}
	context.subscriptions.push(vscode.languages.registerCompletionItemProvider("sql", new SqlAutoComplete(db, vscode.workspace.getConfiguration('dbrun')?.get<string>('connection') ?? "")));
}

function dbConnect() {
	let conf = vscode.workspace.getConfiguration('dbrun');
	let con = conf.get<string>('connection') ?? "";
	let cons = conf.get<{ [name: string]: string }>('connections') ?? null;
	db.connect(currCon ?? (cons === null ? con : cons[Object.keys(cons)[0]]));
}

async function chooseConn() {
	let conf = vscode.workspace.getConfiguration('dbrun');
	let cons = conf.get<{ [name: string]: string }>('connections') ?? null;
	if (cons) {
		let vals = await vscode.window.showQuickPick(Object.values(cons));
		if (vals) {
			currCon = vals;
			currName = Object.entries(cons).find(p => p[1] === vals)?.[0] ?? "dbrun";
			if (stIcon !== null) {
				stIcon.text = currName;
			}
			dbConnect();
			console.log(vals);
		}
	}
}

function changeLogLang() {
	for (const editor of vscode.window.visibleTextEditors) {
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
		let cons = conf.get<{ [name: string]: string }>('connections') ?? false;
		let lim = conf.get<number>('rowLimit') ?? 10;
		let limit = nw ? 99000 : lim;

		db.extraLog = data => _outputChannel.appendLine(data.toString());
		let doptions = new DbRunOptions();
		doptions.fileText = ttext;
		doptions.connectionString = currCon ?? (cons === false ? con : cons[Object.keys(cons)[0]]);
		doptions.currentLine = lineNumber;
		doptions.currentCol = colNumber;
		doptions.rowLimit = limit;
		doptions.format = options?.format ?? "text";
		doptions.eol = editor.document.eol === vscode.EndOfLine.LF ? "\n" : "\r\n";

		let output = await db.go(doptions);
		if (output.newParams.length > 0) {
			editor.edit(builder => {
				for (let par of output.newParams) {
					builder.insert(new vscode.Position(output.queryStartLine, 0), '--' + par + '=null' + doptions.eol);
				}
			});
		}
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
				let ext = '.txt';
				if (doptions.format === 'text') {
					ext = '.txt';
				} else if (doptions.format === 'csv') {
					ext = '.csv';
				} else if (doptions.format === 'insert') {
					ext = '.sql';
				}
				let filename = "qr" + (Math.random().toString(36).replace(/[^a-z]+/g, "").substr(0, 10)) + ext;
				await showText(filename, output.output);
			} else {
				_outputChannel.appendLine(output.output);
			}
		}
		setTimeout(() => changeLogLang(), 1000);
	}
}

async function showText(title: string, output: string) {
	let uri = vscode.Uri.parse(`untitled:${title}`);
	let textdoc = await vscode.workspace.openTextDocument(uri);
	if (title.endsWith("txt")) {
		vscode.languages.setTextDocumentLanguage(textdoc, "dbrun");
	}
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