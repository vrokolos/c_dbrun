import * as fs from "fs";
import { matchAll, parsecsv } from  "./utils";
const spawn = require("child_process").spawn;
export class SqlPlus {

    dbmsQry = `
    begin
        DBMS_METADATA.set_transform_param (DBMS_METADATA.session_transform, 'STORAGE', false);
        DBMS_METADATA.set_transform_param (DBMS_METADATA.session_transform, 'SEGMENT_ATTRIBUTES', false);
        DBMS_METADATA.set_transform_param (DBMS_METADATA.session_transform, 'TABLESPACE', false);
        dbms_metadata.set_transform_param(dbms_metadata.session_transform, 'EMIT_SCHEMA', false);
    end;
`;
    public qryDDL(wrd: string): string {
        return `
select to_clob('/* ' || OBJECT_NAME || '        TYPE: ' || object_type || '          LAST DDL: ' || to_char(last_ddl_time, 'dd/mm/yyyy hh24:mi') || ' */') as DDL from user_objects where OBJECT_NAME = '${wrd}'
union all select '/* ' || replace(wm_concat(column_name), ',', ', ') || ' */' as DDL from cols where table_name = '${wrd}'
union all select '/* ' || replace(wm_concat('a.' || column_name), ',', ', ') || ' */' from cols where table_name = '${wrd}'
union all select dbms_metadata.GET_DDL(
decode(object_type, 'PACKAGE', 'PACKAGE_SPEC', 'PACKAGE BODY', 'PACKAGE_BODY', object_type), object_name) || ';' || CHR(13) || '/' as DDL
from user_objects
WHERE OBJECT_NAME = '${wrd}'
union all SELECT dbms_metadata.GET_DDL('INDEX', a.INDEX_NAME)  || ';' || CHR(13) || '/' AS DDL FROM user_indexes a WHERE table_name = '${wrd}'
union all select dbms_metadata.GET_DDL('TRIGGER', a.TRIGGER_NAME) || ';' || CHR(13) || '/' FROM user_triggers a WHERE table_name = '${wrd}'
`;
    }

    private qrySelect(file2res: string, queryTpe: string, limit: number): string {
        let header1 = "";
        let mid = "";
        let tail = "";
        let killprocs = "";
        if (queryTpe !== "ddl") {
            header1 = "select * from (";
            mid = `) where rownum <= ${limit};\n\n select count(*) as cnt from (`;
            tail = ");";
        }
        if (true) {
            let markup = "";
            if (queryTpe === "select") {
                markup = " markup csv on";
            }
            header1 = `SET TERMOUT OFF${markup};\nwhenever sqlerror exit sql.sqlcode;\nspool \"C:\\temp\\test.json\";\nalter session set NLS_DATE_FORMAT = 'dd/mm/yy HH24:mi:ss';\n` + header1;
            tail = tail + "\nexit;";
        }
        if (queryTpe === "ddl") {
            header1 = "set TERMOUT OFF linesize 300 long 2000000000 longchunksize 32767 PAGESIZE 0 FEEDBACK OFF ECHO OFF;\nspool \"C:\\temp\\ddl.sql\";\nwhenever sqlerror exit sql.sqlcode;\nalter session set NLS_DATE_FORMAT = 'dd/mm/yy HH24:mi:ss';\n" + this.dbmsQry + "\n/\n";

            file2res = file2res.trim();
            if (!file2res.endsWith(";")) {
                file2res = file2res + ";";
            }
            killprocs = header1 + file2res + tail;
        } else {
            killprocs = header1 + file2res + mid + file2res + tail;
        }
        return killprocs;
    }

    public async exec(con: string, qr: string, limit: number, queryTpe: string, eol: string): Promise<{ out: string[], data: any[], cnt: string | null }> {
        let killprocs = "";
        if (queryTpe === "update" || queryTpe === "block") {
            killprocs = qr;
            qr = qr.trim();
            if (queryTpe === "block") {
                if (!qr.endsWith("/")) {
                    killprocs = qr + "\n/";
                }
            } else {
                if (!qr.endsWith(";")) {
                    killprocs = qr + ";";
                }
            }
            killprocs = killprocs + "\nexit;";
        } else {
            killprocs = this.qrySelect(qr, queryTpe, limit);
        }
        let run = `c:\\apps\\oracle\\sqlplus.exe -s ${con} @c:\\temp\\test.sql`;
        fs.writeFileSync("c:\\temp\\test.sql", killprocs, "utf8");
        let rr = await new Promise<string>((r, s) => {
            let _process = spawn(run, [], { cwd: "c:\\temp", env: { NLS_LANG: "AMERICAN_AMERICA.UTF8" }, shell: true });
            _process.stdout.on("data", (data: any) => r(data.toString()));
            _process.stderr.on("data", (data: any) => r(data.toString()));
            _process.on("close", (code: any) => r(""));
        });

        let data = fs.readFileSync("c:\\temp\\test.json", "utf8").split(eol).filter(p => p !== "").join(eol);
        let output = data;
        output = output.replace(/T00\:00\:00\+0?\:00/g, "");
        output = output.replace(/00\:00\:00/g, "");
        let cnt = "";
        let out: string[] = [rr];
        if (output.indexOf("ERROR") > -1) {
            for (let line of output.split(eol)) {
                if (line.trim() === "") {
                } else if (line.startsWith("Session altered.")) {
                } else if (line.endsWith(" rows selected.")) {
                } else {
                    if (line === "") {
                    } else if (line.indexOf("ERROR at line ") > - 1) {

                        let result = matchAll(line, /line (\d*)/g);
                        for (let match of result) {
                            let pName = match[1];
                            line = line.replace(pName, (parseInt(pName) - 1).toString());
                        }
                        out.push(line);
                    } else {
                        out.push(line);
                    }
                }
            }
            return { data: [], cnt: "-1", out: out.concat(output) };
        } else {

            let cntNow = false;
            let realout: string[] = [];
            let rowsFetched = null;
            for (let line of output.split(eol)) {
                if (line.trim() === "") {
                } else if (line.startsWith("Session altered.")) {
                } else if (line.indexOf("rows selected.") > -1) {
                    rowsFetched = line.replace(" rows selected.", "").trim();
                } else if (cntNow) {
                    cnt = line.trim();
                    if (rowsFetched) {
                        cnt = `${rowsFetched}/${cnt}`;
                    }
                } else if (line.trim().indexOf("\CNT\"") > -1) {
                    cntNow = true;
                } else if (queryTpe !== "ddl") {
                    realout.push(line);
                }
            }

            output = realout.join(eol);
            let js = await parsecsv(output);
            return { data: js, cnt: cnt, out: out };
        }
    }

}