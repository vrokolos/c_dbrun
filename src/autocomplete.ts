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

    /** Clears the cached object list so the next completion request re-fetches it from the DB. */
    refresh(): void {
        this.cache = null;
    }

    /** Updates the connection used for autocomplete, clearing the cache if it actually changed. */
    setConnection(conString: string): void {
        if (this.conString !== conString) {
            this.conString = conString;
            this.cache = null;
        }
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