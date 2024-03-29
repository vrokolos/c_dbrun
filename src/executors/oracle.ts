import oracledb from "oracledb";
import { ExecIn, ExecOut, Executor } from "../iDB";
import { matchAll } from "../utils";
import { Position } from "../dbrun";
export class Oracle implements Executor {
    conn?: oracledb.Connection;

    dbmsQry = `
    begin
        DBMS_METADATA.set_transform_param (DBMS_METADATA.session_transform, 'STORAGE', false);
        DBMS_METADATA.set_transform_param (DBMS_METADATA.session_transform, 'SEGMENT_ATTRIBUTES', false);
        DBMS_METADATA.set_transform_param (DBMS_METADATA.session_transform, 'TABLESPACE', false);
        dbms_metadata.set_transform_param (dbms_metadata.session_transform, 'EMIT_SCHEMA', false);
        dbms_metadata.set_transform_param (dbms_metadata.session_transform, 'PRETTY', false);
        DBMS_METADATA.SET_TRANSFORM_PARAM (DBMS_METADATA.SESSION_TRANSFORM, 'SQLTERMINATOR',false);
    end;
`;
    public qryDDL(wrd: string): string {
        return `select object_type as otype, '${wrd}' || decode(object_Type, 'PACKAGE', '_SPEC', '') as filename, dbms_metadata.GET_DDL(decode(object_type, 'PACKAGE', 'PACKAGE_SPEC', 'PACKAGE BODY', 'PACKAGE_BODY', object_type), object_name) || CHR(10) || CHR(13) as DDL from user_objects WHERE OBJECT_NAME = '${wrd}'
union all SELECT null as otype, '${wrd}' as filename, dbms_metadata.GET_DDL('INDEX', a.INDEX_NAME)  || ';' || CHR(10)|| CHR(13) || '/' AS DDL FROM user_indexes a WHERE table_name = '${wrd}'
union all select null as otype, '${wrd}' as filename, dbms_metadata.GET_DDL('TRIGGER', a.TRIGGER_NAME) || ';'|| CHR(10) || CHR(13) || '/' FROM user_triggers a WHERE table_name = '${wrd}'`;
    }

    private errorQry(wrd: string): string {
        return `select * from user_errors where NAME = '${wrd.toUpperCase()}'`;
    }

    public async getObjects(conString: string): Promise<{ name: string, type: string }[]> {
        let res = await this.exec({ connectionString: conString, query: "SELECT OBJECT_NAME, OBJECT_TYPE FROM USER_OBJECTS WHERE OBJECT_TYPE in ('TABLE', 'VIEW', 'FUNCTION', 'PROCEDURE', 'PACKAGE')", rowLimit: 999999, params: [], isDDL: false });
        return res.data.map(p => ({ name: p.OBJECT_NAME, type: p.OBJECT_TYPE }));
    }

    public async connect(constring: string) {
        oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
        oracledb.fetchAsString = [oracledb.CLOB, oracledb.DATE];

        let spl = constring.split("@");
        let usrpas = spl[0];
        let conStr = spl[1];
        let conUser = usrpas.split("/")[0];
        let conPass = usrpas.split("/")[1];
        this.conn = await oracledb.getConnection({ connectString: conStr, user: conUser, password: conPass });
        await this.conn.execute(this.dbmsQry);
        await this.conn.execute(`ALTER SESSION SET NLS_DATE_FORMAT='yyyy-mm-dd HH24:MI:SS'`);
    }

    public async exec(opts: ExecIn): Promise<ExecOut> {
        let final: ExecOut = new ExecOut();

        let objectType = "TABLE";
        try {
            if (!this.conn) {
                await this.connect(opts.connectionString);
            }

            let query = opts.query;

            if (opts.isDDL) {
                let ddlQuery = this.qryDDL(opts.query);
                let ddlResults = await this.conn?.execute<{ FILENAME: string, OTYPE: string, DDL: string }>(ddlQuery);
                if (ddlResults?.rows) {
                    let ddls: any[] = ddlResults?.rows;
                    for (let ddl of ddls) {
                        if (!final.ddlFiles.hasOwnProperty(ddl.FILENAME)) {
                            final.ddlFiles[ddl.FILENAME] = [];
                        }
                        let tddlspl: string[] = ddl.DDL.split('\n');
                        if (tddlspl[0].trim() === '') {
                            tddlspl = tddlspl.slice(1);
                        }

                        final.ddlFiles[ddl.FILENAME].push(tddlspl.join('\n'));
                    }
                    objectType = ddls.filter(p => p.OTYPE !== "" && p.OTYPE !== null)[0]?.OTYPE;
                }
                query = "SELECT * FROM " + opts.query;
            }

            let rowsAffected = 0;
            if (objectType === "TABLE" || objectType === "VIEW") {

                let params: oracledb.BindParameters = {};
                for (let p of opts.params ?? []) {
                    let obj: oracledb.BindParameter = { dir: oracledb.BIND_IN, val: p.value };
                    if (p.value instanceof Date) {
                        obj.type = oracledb.DB_TYPE_DATE;
                    }
                    params[p.name] = obj;
                }
                let results = await this.conn?.execute<any>(query, params, { resultSet: true });
                if (results?.metaData) {
                    for (let ddl of Object.keys(final.ddlFiles)) {
                        let newlines = ["/* " + results.metaData.map(p => p.name).join(", ") + " */",
                        "/* " + results.metaData.map(p => "A." + p.name).join(", ") + " */"];
                        final.ddlFiles[ddl] = newlines.concat(final.ddlFiles[ddl]);
                    }
                }
                if (results?.resultSet) {
                    final.data = await results.resultSet.getRows(opts.rowLimit);
                    final.dataCount = final.data.length + "/";
                    try {
                        let countResult = await this.conn?.execute<{ CNT: string }>("Select count(*) as CNT from (" + query + ")", params);
                        final.dataCount += countResult?.rows?.[0].CNT ?? "??";
                    } catch {
                        final.dataCount += "??";
                    }
                } else {
                    rowsAffected = results?.rowsAffected || 0;
                    final.dataCount = rowsAffected?.toString() ?? "";
                }
            }

            try {
                if (rowsAffected === 0) {
                    let regx = /CREATE\s.*?\s\"?(\w*?)\"?\s(?:IS|AS)/gi;
                    let result = matchAll(query, regx);
                    for (let match of result) {
                        let pName = match[1].trim();
                        let errorQry = this.errorQry(pName);
                        let errorRes = await this.conn?.execute<{ NAME: string, TYPE: string, LINE: number, POSITION: number, TEXT: string, ATTRIBUTE: string }>(errorQry);
                        let errorRows = errorRes?.rows;
                        if (errorRows && errorRows.length !== 0) {
                            final.output = errorRows.map(p => "Error: " + p.TEXT + " (Line: " + p.LINE + " Column: " + p.POSITION + ")") ?? [];
                            final.errorOffset = new Position();
                            final.errorOffset.line = errorRows[0].LINE;
                            final.errorOffset.col = errorRows[0].POSITION - 1;
                        }
                        break;
                    }
                }
            } catch (ex) {
                final.output.push("Couldn't get error message: " + (<any>ex).toString());
            }
        } catch (ex) {
            final.output = [(<any>ex).toString()];
            final.errorOffset = (<any>ex).offset;
            console.log(ex);
        }

        return final;
    }
}