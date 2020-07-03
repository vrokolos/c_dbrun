import oracledb from "oracledb";
import { ExecIn, ExecOut, Executor } from "./iDB";
export class Oracle implements Executor {
    conn?: oracledb.Connection;

    dbmsQry = `
    begin
        DBMS_METADATA.set_transform_param (DBMS_METADATA.session_transform, 'STORAGE', false);
        DBMS_METADATA.set_transform_param (DBMS_METADATA.session_transform, 'SEGMENT_ATTRIBUTES', false);
        DBMS_METADATA.set_transform_param (DBMS_METADATA.session_transform, 'TABLESPACE', false);
        dbms_metadata.set_transform_param (dbms_metadata.session_transform, 'EMIT_SCHEMA', false);
        dbms_metadata.set_transform_param (dbms_metadata.session_transform, 'PRETTY', true);
    end;
`;
    public qryDDL(wrd: string): string {
        return `select object_type as otype, '${wrd}' || decode(object_Type, 'PACKAGE', '_SPEC', '') as filename, dbms_metadata.GET_DDL(decode(object_type, 'PACKAGE', 'PACKAGE_SPEC', 'PACKAGE BODY', 'PACKAGE_BODY', object_type), object_name) || ';' || CHR(13) || '/' as DDL from user_objects WHERE OBJECT_NAME = '${wrd}'
union all SELECT null as otype, '${wrd}' as filename, dbms_metadata.GET_DDL('INDEX', a.INDEX_NAME)  || ';' || CHR(13) || '/' AS DDL FROM user_indexes a WHERE table_name = '${wrd}'
union all select null as otype, '${wrd}' as filename, dbms_metadata.GET_DDL('TRIGGER', a.TRIGGER_NAME) || ';' || CHR(13) || '/' FROM user_triggers a WHERE table_name = '${wrd}'`;
    }

    public async exec(opts: ExecIn): Promise<ExecOut> {
        let final: ExecOut = new ExecOut();

        let objectType = "TABLE";
        try {
            if (!this.conn) {
                oracledb.outFormat = oracledb.OUT_FORMAT_OBJECT;
                oracledb.fetchAsString = [oracledb.CLOB];

                let spl = opts.connectionString.split("@");
                let usrpas = spl[0];
                let conStr = spl[1];
                let conUser = usrpas.split("/")[0];
                let conPass = usrpas.split("/")[1];
                this.conn = await oracledb.getConnection({ connectString: conStr, user: conUser, password: conPass });
            }

            let query = opts.query;

            if (opts.isDDL) {
                await this.conn.execute(this.dbmsQry);
                let ddlQuery = this.qryDDL(opts.query);
                let ddlResults = await this.conn.execute<{ FILENAME: string, OTYPE: string, DDL: string }>(ddlQuery);
                if (ddlResults?.rows) {
                    let ddls: any[] = ddlResults?.rows;
                    for (let ddl of ddls) {
                        if (!final.ddlFiles.hasOwnProperty(ddl.FILENAME)) {
                            final.ddlFiles[ddl.FILENAME] = [];
                        }
                        final.ddlFiles[ddl.FILENAME].push(ddl.DDL);
                    }
                    objectType = ddls.filter(p => p.OTYPE !== "" && p.OTYPE !== null)[0]?.OTYPE;
                }
                query = "SELECT * FROM " + opts.query;
            }

            if (objectType === "TABLE" || objectType === "VIEW") {
                let results = await this.conn?.execute<any>(query, [], { resultSet: true });
                if (results.metaData) {
                    for (let ddl of Object.keys(final.ddlFiles)) {
                        let newlines = ["/* " + results.metaData.map(p => p.name).join(", ") + " */", 
                        "/* " + results.metaData.map(p => "A." + p.name).join(", ") + " */"]
                        final.ddlFiles[ddl] = newlines.concat(final.ddlFiles[ddl]);
                    }
                }
                if (results.resultSet) {
                    final.data = await results.resultSet.getRows(opts.rowLimit);
                    final.dataCount = final.data.length + "/";
                    try {
                        let countResult = await this.conn.execute<{ CNT: string }>("Select count(*) as CNT from (" + query + ")");
                        final.dataCount += countResult?.rows?.[0].CNT ?? "??";
                    } catch {
                        final.dataCount += "??";
                    }
                } else {
                    final.dataCount = results?.rowsAffected?.toString() ?? "";
                }
            }
        } catch (ex) {
            final.output = [ex.toString()];
            final.errorOffset = ex.offset;
            console.log(ex);
        }

        return final;
    }
}