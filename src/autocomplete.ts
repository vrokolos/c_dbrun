import * as vscode from 'vscode';
import { DBRun, DbRunOptions } from './dbrun';

export class SqlAutoComplete implements vscode.CompletionItemProvider {
    db: DBRun;
    conString: string;
    cache: any[] | null = null;

    constructor (dbRun: DBRun, conString: string) {
        this.db = dbRun;
        this.conString = conString;
    }

    async provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.CompletionList> {
        if (this.cache === null) {
            this.cache = await this.db.getObjects(this.conString);
        }
        return new vscode.CompletionList(this.cache.map(p => new vscode.CompletionItem(p.name, this.getKindFromType(p.type) )));
    }

    getKindFromType(type: string): vscode.CompletionItemKind | undefined {
        let t = undefined;
        if (type === "TABLE") {
            return vscode.CompletionItemKind.Enum;
        } else if (type === "FUNCTION") {
            return vscode.CompletionItemKind.Function;
        } else if (type === "PROCEDURE") {
            return vscode.CompletionItemKind.Function;
        } else if (type === "PACKAGE") {
            return vscode.CompletionItemKind.Module;  
        } else if (type === "VIEW") {
            return vscode.CompletionItemKind.Struct;  
        }
        return t;
    }
}