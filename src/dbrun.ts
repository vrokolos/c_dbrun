import { performance } from "perf_hooks";
import Table from 'cli-table3';
import { matchAll } from "./utils";
import { Oracle } from "./oracle";
import { ExportToCsv } from 'export-to-csv';
import { Executor } from "./iDB";

export class DBRun {
    private subqueryStart = 0;

    private output: string[] = [];

    public runner: Executor = new Oracle();

    GetCurrentWord(text: string, eol: string, cline: number = 0, ccol: number = 0): string {
        let tests = text.split(eol);
        let currentLine = tests[cline - 1];
        let delim = [" ", ",", "(", ")", eol, "'"];
        let startCol = 0;
        for (let i = ccol; i >= 0; i--) {
            let curChar = currentLine[i] || "";
            if (delim.indexOf(curChar) > -1) {
                startCol = i + 1;
                break;
            }
        }
        let endCol = currentLine.length;
        for (let i = ccol; i < currentLine.length; i++) {
            let curLine = currentLine[i] || "";
            if (delim.indexOf(curLine) > -1) {
                endCol = i;
                break;
            }
        }
        let query = currentLine.substring(startCol, endCol);
        return query;
    }

    GetCurrentQuery(text: string, eol: string, cline: number = 0): string {
        let line = cline;
        let tests = text.split(eol);
        if (!tests[line] || tests[line].trim() === "") {
            line--;
        }
        let startLine = 0;

        for (let i = line; i >= 0; i--) {
            let curLine = tests[i] || "";
            if (curLine.trim() === "") {
                startLine = i + 1;
                break;
            }
        }
        let endLine = tests.length;
        for (let i = line; i < tests.length; i++) {
            let curLine = tests[i] || "";
            if (curLine.trim() === "") {
                endLine = i;
                break;
            }
        }
        let query = "";
        for (let q = startLine; q < endLine; q++) {
            query = query + tests[q] + eol;
        }
        this.subqueryStart = startLine;
        return query;
    }

    FetchQuery(file2: string, eol: string, cline: number = 0, ccol: number = 0): string {
        if (ccol !== 0) {
            let wrd = this.GetCurrentWord(file2, eol, cline, ccol);
            wrd = wrd.toUpperCase();
            file2 = wrd;
        } else if (cline !== 0) {
            file2 = this.GetCurrentQuery(file2, eol, cline);
        }
        let file2res = file2.split(eol).filter(p => p !== "").join(eol);
        let patt = /--(\:.*?)\s?=\s?(.*)/gi;
        let result = matchAll(file2, patt);
        for (let match of result) {
            let pName = match[1];
            let pValue = match[2];
            let reg = new RegExp(pName, "ig");
            file2res = file2res.replace(reg, pValue);
        }
        return file2res;
    }

    log(data: any) {
        //console.log(data);
        this.output.push(data);
    }

    extraLog(data: any) { /* */ }

    private show(js: object[], format: string = "text"): string {
        let output = "";
        if (format === "text") {
            let headCols = Object.keys(js[0]);
            var table = new Table({
                chars: { 'top-mid': '', 'bottom-mid': '', "mid-mid": '', "middle": '' },
                head: headCols,
                style: { head: [], border: [], compact: true },
                wordWrap: false
            });
            for (let j of js) {
                table.push(Object.values(j));
            }
            output = table.toString();
        } else {
            const csvExporter = new ExportToCsv({ fieldSeparator: ',', quoteStrings: '"', decimalSeparator: '.', showLabels: true, useKeysAsHeaders: true });
            output = csvExporter.generateCsv(js, true);
        }
        return output;
    }

    printCNT(cnter: string | null, milliSec: number) {
        let header = "dbrun ";
        let rr = cnter ? "rows: [" + cnter + "]        " : "";
        this.extraLog(header + rr + "time: " + milliSec + " ms");
    }

    async go(options: DbRunOptions): Promise<DbRunOutput> {
        this.output = [];
        let output = new DbRunOutput();

        if (!options.connectionString) {
            console.log("no connection string defined");
            throw new Error("dbrun => No connection string defined. Set one in settings");
        }

        let qr = this.FetchQuery(options.fileText, options.eol, options.currentLine, options.currentCol);
        let stopwatch = performance.now();
        let rr = await this.runner.exec({ connectionString: options.connectionString, query: qr, rowLimit: options.rowLimit, isDDL: options.currentCol !== 0 });
        let ms = Math.round(performance.now() - stopwatch);

        if (rr.output) {
            rr.output.map((s) => this.log(s));
        }
        if (rr.data && rr.data.length > 0) {
            let output1 = this.show(rr.data, options.format);
            this.log(output1);
        }
        this.printCNT(rr.dataCount, ms);

        if (rr.errorOffset) {
            let pos = this.getPositionFromOffset(qr, rr.errorOffset, options.eol);
            if (pos !== null && options.currentLine !== 0 && options.currentCol === 0) {
                pos.line += this.subqueryStart;
            }
            output.errorPosition = pos;
        }
        output.files = rr.ddlFiles;
        output.output = this.output.join(options.eol);
        return output;
    }

    getPositionFromOffset(text: string, offset: number, eol: string): Position {
        let r = new Position();
        let curPos = 0;
        let lineNo = 1;
        for (let line of text.split(eol)) {
            let lineOffset = curPos;
            let lineLength = line.length + eol.length;
            if (lineOffset + lineLength > offset) {
                /*this is the line*/
                curPos += lineLength;
                r.line = lineNo;
                r.col = offset - lineOffset;
                return r;
            } else {
                /* this is not the line */
                curPos = curPos + lineLength;
            }
            lineNo++;
        }
        return new Position();
    }
}

export class DbRunOptions {
    fileText: string = "";
    connectionString: string = "";
    rowLimit: number = 10;
    currentLine: number = 0;
    currentCol: number = 0;
    eol: string = "\n";
    format: string = "text";
}

export class DbRunOutput {
    errorPosition?: Position;
    output: string = "";
    files: { [filename: string]: string[] } = {};
}

export class Position {
    line: number = 0;
    col: number = 0;
}