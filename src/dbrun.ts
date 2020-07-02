import { performance } from "perf_hooks";
import Table from 'cli-table3';
import { matchAll } from "./utils";
import { Oracle } from "./oracle";
import { ExportToCsv } from 'export-to-csv';

export class DBRun {
    private con = "";
    private limit = 10;
    private cline = 0;
    private ccol = 0;
    private eol = "\n";
    private subqueryStart = 0;

    private output: string[] = [];

    public runner = new Oracle();

    GetCurrentWord(text: string): string {
        let tests = text.split(this.eol);
        let currentLine = tests[this.cline - 1];
        let delim = [" ", ",", "(", ")", this.eol, "'"];
        let startCol = 0;
        for (let i = this.ccol; i >= 0; i--) {
            let curChar = currentLine[i] || "";
            if (delim.indexOf(curChar) > -1) {
                startCol = i + 1;
                break;
            }
        }
        let endCol = currentLine.length;
        for (let i = this.ccol; i < currentLine.length; i++) {
            let curLine = currentLine[i] || "";
            if (delim.indexOf(curLine) > -1) {
                endCol = i;
                break;
            }
        }
        let query = currentLine.substring(startCol, endCol);
        return query;
    }

    GetCurrentQuery(text: string): string {
        let tests = text.split(this.eol);
        if (!tests[this.cline] || tests[this.cline].trim() === "") {
            this.cline--;
        }
        let startLine = 0;

        for (let i = this.cline; i >= 0; i--) {
            let curLine = tests[i] || "";
            if (curLine.trim() === "") {
                startLine = i + 1;
                break;
            }
        }
        let endLine = tests.length;
        for (let i = this.cline; i < tests.length; i++) {
            let curLine = tests[i] || "";
            if (curLine.trim() === "") {
                endLine = i;
                break;
            }
        }
        let query = "";
        for (let q = startLine; q < endLine; q++) {
            query = query + tests[q] + this.eol;
        }
        this.subqueryStart = startLine;
        return query;
    }

    FetchQuery(file2: string): string {
        if (this.ccol !== 0) {
            let wrd = this.GetCurrentWord(file2);
            wrd = wrd.toUpperCase();
            file2 = wrd;
        } else if (this.cline !== 0) {
            file2 = this.GetCurrentQuery(file2);
        }
        let file2res = file2.split(this.eol).filter(p => p !== "").join(this.eol);
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

    detectQueryType(file2res: string): string {
        if (this.ccol !== 0) {
            return "ddl";
        }
        for (let line of file2res.split(this.eol)) {
            let upperLine = line.toUpperCase().trim();
            if (!upperLine.startsWith("--")) {
                if (upperLine.startsWith("SELECT") || upperLine.startsWith("WITH")) {
                    return "select";
                } else if (upperLine.startsWith("BEGIN") || upperLine.startsWith("DECLARE")) {
                    return "block";
                } else {
                    return "update";
                }
            }
        }
        return "";
    }

    log(data: any) {
        console.log(data);
        this.output.push(data);
    //    this.extraLog(data);
    }

    extraLog(data: any) { /* */ }

    private show(js: any, cols: any[] | null, format: string = "text"): string {
        let output = "";
        if (format === "text") {
            let headCols = cols;
            if (!headCols) {
                headCols = Object.keys(js[0]);
            }
            var table = new Table({
                chars: { 'top-mid': '', 'bottom-mid': '', "mid-mid": '', "middle": '' },
                head: headCols,
                style: { head: [], border: [], compact: true },
                wordWrap: false
            });
            if (cols) {
                for (let j of js) {
                    table.push(j);
                }
            } else {
                for (let j of js) {
                    let vals: any[] = Object.values(j);
                    table.push(vals);
                }
            }
            output = table.toString();
        } else {
            const options = { 
                fieldSeparator: ',',
                quoteStrings: '"',
                decimalSeparator: '.',
                showLabels: true, 
                useTextFile: false,
                useKeysAsHeaders: true
              };
             
            const csvExporter = new ExportToCsv(options);
            output = csvExporter.generateCsv(js, true);
        }
        return output;
    }

    printCNT(cnter: string | null, milliSec: number) {
        let rr = cnter ? "Rows: [" + cnter + "]        " : "";
        this.extraLog(rr + "Time: " + milliSec + " ms");
    }

    async go(options: DbRunOptions): Promise<DbRunOutput> {
        this.output = [];
        this.con = options.con;
        this.limit = options.limit || 10;
        this.cline = options.cline || 0;
        this.ccol = options.ccol || 0;
        this.eol = options.eol || "\n";
        let output: DbRunOutput = { output: "" };

        if (!this.con) {
            console.log("no connection string defined");
            throw new Error("dbrun => No connection string defined. Set one in settings");
        }

        let qr = this.FetchQuery(options.inputfile);
        let queryTpe = this.detectQueryType(qr);

        let stopwatch = performance.now();
        let rr = await this.runner.exec(this.con, qr, this.limit, queryTpe, this.eol);
        let ms = Math.round(performance.now() - stopwatch);
        if (rr.out) {
            rr.out.map((s) => this.log(s));
        }
        if (rr.data && rr.data.length > 0) {
            let output1 = this.show(rr.data, rr.cols, options.format);
            this.log(output1);
        }
        this.printCNT(rr.cnt, ms);

        if (rr.errorOffset) {
            let pos = this.getPositionFromOffset(qr, rr.errorOffset, this.eol);
            if (pos !== null && options.cline !== 0 && options.ccol === 0) {
                pos.line += this.subqueryStart;
            }
            output.errorPosition = pos;
        }
        output.ddl = rr.ddl;
        output.output = this.output.join(this.eol);
        return output;
    }

    getPositionFromOffset(text: string, offset: number, eol: string): Position {
        let r = { line: 0, col: 0 };
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
        return { line: 0, col: 0 };
    }
}

export class DbRunOptions {
    inputfile: string = "";
    con: string = "";
    limit?: number;
    cline?: number;
    ccol?: number;
    eol?: string;
    format?: string = "text";
}

export class DbRunOutput {
    errorPosition?: Position;
    output: string = "";
    ddl?: { [filename: string]: string[] };
}

export class Position {
    line: number = 0;
    col: number = 0;
}