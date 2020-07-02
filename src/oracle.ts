import oracledb from "oracledb";
export class Oracle {
    con: string = "";
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
        return `select object_type as otype, '${wrd}' as filename, to_clob('/* ' || OBJECT_NAME || '        TYPE: ' || object_type || '          LAST DDL: ' || to_char(last_ddl_time, 'dd/mm/yyyy hh24:mi') || ' */') as DDL from user_objects where OBJECT_NAME = '${wrd}'
union all select null as otype, '${wrd}' as filename, '/* ' || replace(wm_concat(column_name), ',', ', ') || ' */' as DDL from cols where table_name = '${wrd}'
union all select null as otype, '${wrd}' as filename, '/* ' || replace(wm_concat('a.' || column_name), ',', ', ') || ' */' from cols where table_name = '${wrd}'
union all select object_type as otype, '${wrd}' || decode(object_Type, 'PACKAGE', '_SPEC', '') as filename, dbms_metadata.GET_DDL(decode(object_type, 'PACKAGE', 'PACKAGE_SPEC', 'PACKAGE BODY', 'PACKAGE_BODY', object_type), object_name) || ';' || CHR(13) || '/' as DDL from user_objects WHERE OBJECT_NAME = '${wrd}'
union all SELECT null as otype, '${wrd}' as filename, dbms_metadata.GET_DDL('INDEX', a.INDEX_NAME)  || ';' || CHR(13) || '/' AS DDL FROM user_indexes a WHERE table_name = '${wrd}'
union all select null as otype, '${wrd}' as filename, dbms_metadata.GET_DDL('TRIGGER', a.TRIGGER_NAME) || ';' || CHR(13) || '/' FROM user_triggers a WHERE table_name = '${wrd}'
`;
    }

    public async exec(con: string, qr: string, limit: number, queryTpe: string, eol: string): Promise<ExecOut> {
        this.con = con;
        let out: string[] = [];
        let cnt: string = "";
        let errorOffset = null;
        let theddl: { [filename: string]: string[] } = {};
        let objectType = "TABLE";
        try {
            if (!this.conn) {
                this.conn = await this.connect();
            }
            let query = qr;
            if (queryTpe === "ddl") {
                await this.dbrun(this.dbmsQry);
                query = this.qryDDL(qr);
                let results = await this.conn.execute(query, [], {
                    outFormat: oracledb.OUT_FORMAT_OBJECT,
                    fetchInfo: { "DDL": { type: oracledb.STRING } }
                });
                if (results?.rows) {
                    let ddls: any[] = results?.rows;
                    let ddlres: { [filename: string]: string[] } = {};
                    for (let ddl of ddls) {
                        if (!ddlres.hasOwnProperty(ddl.FILENAME)) {
                            ddlres[ddl.FILENAME] = [];
                        }
                        ddlres[ddl.FILENAME].push(ddl.DDL);
                    }
                    objectType = ddls.filter(p => p.OTYPE !== "" && p.OTYPE !== null)[0].OTYPE;
                    theddl = ddlres;
                }
                query = "SELECT * FROM " + qr;
            }
            if (queryTpe === "select" || (queryTpe === "ddl" && (objectType === "TABLE" || objectType === "VIEW"))) {
                let results = await this.dbrun(query);
                let rows = await results.getRows(limit);
                let cnt = rows.length + "/";
                try {
                    let res2 =  await this.conn.execute("Select count(*) as CNT from (" + query + ")");
                    let rows = res2?.rows;
                    if (rows && (rows?.length ?? 0) > 0) {
                        let rcnt = rows[0] as any[];
                        cnt += rcnt[0];
                    }
                } catch {
                    cnt += "??";
                }
                return { out: [], data: rows || [], cnt: cnt, cols: null, errorOffset: null, ddl: theddl };
            }
            if (queryTpe === "update") {
                let res = await this.conn.execute(query);
                if (res.rowsAffected) {
                    cnt = res.rowsAffected.toString();
                }
            }
        } catch (ex) {
            out = [ex.toString()];
            errorOffset = ex.offset;
            console.log(ex);
        }
        return { out: out, data: [], cnt: cnt, cols: [], errorOffset: errorOffset, ddl: {} };
    }

    async connect(): Promise<oracledb.Connection> {
        let spl = this.con.split("@");
        let usrpas = spl[0];
        let conStr = spl[1];
        let conUser = usrpas.split("/")[0];
        let conPass = usrpas.split("/")[1];
        return await oracledb.getConnection({ connectString: conStr, user: conUser, password: conPass });
    }

    async dbrun(sql: string): Promise<oracledb.ResultSet<any>> {
        return new Promise<oracledb.ResultSet<unknown>>((res, rej) => this.conn?.execute(sql, [], { resultSet: true, outFormat: oracledb.OUT_FORMAT_OBJECT, fetchInfo: { "DDL": { type: oracledb.STRING } } }, (err, rs) => err ? rej(err) : res(rs.resultSet)));
    }
}

export class ExecOut {
    out?: string[];
    data?: any[];
    cnt: string = "";
    cols: string[] | null = [];
    ddl?: { [filename: string]: string[] };
    errorOffset?: number | null;
}