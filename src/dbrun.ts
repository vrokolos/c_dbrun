import { performance } from "perf_hooks";
import Table from 'cli-table3';
import { matchAll } from "./utils";
import { Oracle } from "./executors/oracle";
import { Postgres } from "./executors/postgres";
import { ExportToCsv } from 'export-to-csv';
import { Executor, ExecParam } from "./iDB";

export class DBRun {
    private subqueryStart = 0;

    private output: string[] = [];

    public runner?: Executor;

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
            } else if (curLine.indexOf("SQL>") > -1) {
                startLine = i;
                break;
            }
        }
        let endLine = tests.length;
        for (let i = line; i < tests.length; i++) {
            let curLine = tests[i] || "";
            if (curLine.trim() === "") {
                endLine = i;
                break;
            } else if (curLine.indexOf("SQL>") > -1) {
                endLine = i + 1;
                break;
            }
        }
        let query = "";
        for (let q = startLine; q < endLine; q++) {
            let theLine = tests[q];
            query = query + theLine + eol;
        }
        if (query.indexOf("SQL>") > -1) {
            let mtches = matchAll(query, /SQL\>(.*?)\<\//sg);
            for (let match of mtches) {
                query = match[1];
            }
        }
        this.subqueryStart = startLine;
        return query;
    }

    public async connect(conString: string) {
        if (conString.startsWith('postgres')) {
            this.runner = new Postgres();
        } else {
            this.runner = new Oracle();
        }
        try {
            await this.runner.connect(conString);
        } catch (ex) {
            this.extraLog(ex);
        }
    }

    FetchQuery(file2: string, eol: string, cline: number = 0, ccol: number = 0, replaceParams = true): { query: string, params: ExecParam[], paramsNeeded: string[] } {
        if (cline === -99) {
            let regx = /CREATE\s+(?:OR\s+)?(?:REPLACE\s+)?(?:(?:VIEW)|(?:FUNCTION)|(?:PACKAGE)|(?:PACKAGE)|(?:PROCEDURE))\s+(?:BODY\s+)?\"?(\w*)\"?\s*(?:\s|\()/gmi;
            let val = regx.exec(file2)?.[1];
            if (val === undefined) {
                throw new Error("Couldn't find current object name");
            } else {
                file2 = val;
            }
        } else if (ccol !== 0) {
            let wrd = this.GetCurrentWord(file2, eol, cline, ccol);
            wrd = wrd.toUpperCase();
            file2 = wrd;
        } else if (cline !== 0) {
            file2 = this.GetCurrentQuery(file2, eol, cline);
        }
        let params: ExecParam[] = [];
        let file2res = file2;
        if (ccol !== 0 || cline !== 0) {
            file2res = file2res.split(eol).filter(p => p !== "").join(eol);
        }
        let patt = /--(\:.*?)\s?=\s?(.*)/gi;
        let result = matchAll(file2, patt);
        for (let match of result) {
            let pName = match[1];
            let pValue = match[2];
            if (file2.toUpperCase().split(pName.toUpperCase()).length > 2) {
                let param = new ExecParam(pName);
                if (/^-?\d+\.?\d*$/.test(pValue)) {
                    param.value = parseFloat(pValue);
                } else if (pValue.startsWith("'") && pValue.endsWith("'")) {
                    param.value = pValue.substr(1, pValue.length - 2);
                } else {
                    let theDate = Date.parse(pValue);
                    if (theDate) {
                        param.value = new Date(theDate);
                    } else {
                        param.value = pValue;
                    }
                }
                params.push(param);
            }
            if (replaceParams) {
                let reg = new RegExp(pName, "ig");
                file2res = file2res.replace(reg, pValue);
            }
        }

        let needed: string[] = [];

        let neededPatt = /[^-](\:\w+)/gi;
        let resultNeeded = matchAll(file2.replace(/'.*?'/gsm, ''), neededPatt);
        for (let res of resultNeeded) {
            if ([':='].indexOf(res[1].toUpperCase()) === -1) {
                if (!params.some(p => p.name.toUpperCase() === res[1].toUpperCase())) {
                    if (needed.indexOf(res[1].toUpperCase()) === -1) {
                        needed.push(res[1].toUpperCase());
                    }
                }
            }
        }
        return { query: file2res, params: params, paramsNeeded: needed };
    }

    log(data: any) {
        //console.log(data);
        this.output.push(data);
    }

    extraLog(data: any) { /* */ }

    private formatValue(val: any): string {
        if (val === null) {
            return 'null';
        } else if (val === true) {
            return "true";
        } else if (val === false) {
            return "false";
        } else if (typeof val === 'number') {
            return val.toString();
        } else if (val instanceof Date) {
            let theDate = val.toLocaleString('el-GR');
            return `TO_DATE('${theDate}', 'yyyy-mm-dd HH24:MI:SS')`;
        } else if (typeof val === 'string' && val.trim().length >= 8 && val.trim().length <= 10 && !isNaN(new Date(val) as any)) {
            return `TO_DATE('${val}', 'yyyy-mm-dd')`;
        }
        return "'" + val + "'";
    }

    private show(js: { [name: string]: any }[], format: string = "text"): string {
        let output = "";
        if (format === "text") {
            let headCols = Object.keys(js[0]).map(s => ({
                head: s,
                type: typeof js.find(p => p[s] !== null)?.[s],
                maxDecimals: Math.min(Math.max(...js.map(p => typeof p[s] === 'number' ? (p[s].toString().split('.')[1]?.length ?? 0) : 0)), 2)
            }));

            var table = new Table({
                chars: { 'top-mid': '', 'bottom-mid': '', "mid-mid": '', "middle": '' },
                head: headCols.map(s => s.head),
                style: { head: [], border: [], compact: true },
                wordWrap: false
            });
            for (let j of js) {
                let row = [];
                for (let col of headCols) {
                    if (j[col.head] && j[col.head].replace) {
                        j[col.head] = j[col.head].replace(/\s00\:00\:00/g, "");
                    }
                    if (col.type === "number") {
                        row.push({ content: j[col.head]?.toFixed(col.maxDecimals)?.toString(), hAlign: 'right' });
                    } else {
                        row.push(j[col.head]);
                    }
                }
                table.push(row);
            }
            output = table.toString();
        } else if (format === "insert") {
            output = js.map(row => `INSERT INTO THETABLE (${Object.keys(row).join(', ')}) VALUES (${Object.keys(row).map(p => this.formatValue(row[p])).join(", ")});`).join('\n');
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

    async getObjects(conString: string): Promise<{ name: string, type: string }[]> {
        let cn = conString;
        await this.connect(conString);
        let res = await this.runner?.getObjects(cn);
        return res ?? [];
    }

    async go(options: DbRunOptions): Promise<DbRunOutput> {
        this.output = [];
        let output = new DbRunOutput();

        let conString = options.connectionString;
        if (!conString) {
            console.log("no connection string defined");
            throw new Error("dbrun => No connection string defined. Set one in settings");
        }

        let qr = this.FetchQuery(options.fileText, options.eol, options.currentLine, options.currentCol, false);
        let stopwatch = performance.now();
        if (!this.runner) {
            this.connect(conString);
        }
        if (!this.runner) {
            return output;
        }
        let rr = await this.runner.exec({ connectionString: conString, query: qr.query, params: qr.params, rowLimit: options.rowLimit, isDDL: options.currentCol !== 0 || options.currentLine === -99 });
        let ms = Math.round(performance.now() - stopwatch);

        if (rr.output) {
            rr.output.map((s) => this.log(s));
        }
        if (rr.data && rr.data.length > 0) {
            let output1 = this.show(rr.data, options.format);
            this.log(output1);
        }
        this.printCNT(rr.dataCount, ms);

        if (rr.errorOffset !== null) {
            output.errorPosition = rr.errorOffset instanceof Position ? rr.errorOffset : this.getPositionFromOffset(qr.query, rr.errorOffset, options.eol);
            if (options.currentLine !== 0 && options.currentCol === 0) {
                output.errorPosition.line += this.subqueryStart;
            }
        }

        output.files = rr.ddlFiles;
        output.output = this.output.join(options.eol);
        output.newParams = qr.paramsNeeded;
        output.queryStartLine = this.subqueryStart;
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

    newParams: string[] = [];
    queryStartLine = 0;
}

export class Position {
    line: number = 0;
    col: number = 0;
}