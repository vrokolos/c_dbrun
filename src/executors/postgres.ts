import { QueryResult, Pool } from "pg";
import { ExecIn, ExecOut, Executor } from "../iDB";
import { pg } from "yesql";
const Cursor = require('pg-cursor');
export class Postgres implements Executor {
    conn?: Pool;

    public qryDDL(wrd: string): string {
        return `select 'TABLE' as otype, a.table_name as filename, 'CREATE TABLE ' || a.table_name || '(' || string_agg(column_name || ' ' || udt_name
|| case when character_maximum_length is not null then '(' || character_maximum_length || ')' 
        when numeric_precision is null then '' 
        when numeric_scale is null then '(' || numeric_precision || ')' 
        else '(' || numeric_precision || ',' || numeric_scale || ')' 
        end
|| case when is_nullable = 'NO' then ' NOT NULL' else '' end
|| case when column_default is null then '' else ' DEFAULT ' || column_default end
, ', ' order by ordinal_position) || ')' as DDL
from INFORMATION_SCHEMA.COLUMNS  a
where upper(table_name) = upper('${wrd}')
and not exists (select * from information_schema.tables b where a.table_name = b.table_name and b.table_type = 'VIEW' )
and table_schema not in ('information_schema', 'pg_catalog', 'pg_toast')
and table_catalog = current_database()
group by table_name
union all
select 'VIEW', a.table_name, 'CREATE OR REPLACE VIEW ' || a.table_name || ' AS ' || view_definition as script 
from information_schema.views  a
where upper(table_name) = upper('${wrd}')
and table_catalog = current_database()
and table_schema not in ('information_schema', 'pg_catalog', 'pg_toast')
UNION ALL
select case prokind when 'p' then 'PROCEDURE' when 'f' then 'FUNCTION' end, proname, pg_get_functiondef(a.oid) as script from pg_proc a, pg_namespace b where b.nspname not in ('information_schema', 'pg_catalog', 'pg_toast') and b.oid = a.pronamespace and upper(proname) = upper('${wrd}')
`;
        //TODO: TRIGGER INDEX CONSTRAINT
    }

    public async getObjects(conString: string): Promise<{ name: string, type: string }[]> {
        let res = await this.exec({
            connectionString: conString, query: `select routine_name as object_name, routine_type as object_type from information_schema.routines where routine_catalog = current_database() and routine_schema not in ('information_schema', 'pg_catalog', 'pg_toast') union
select table_name, table_type from information_schema.tables where table_catalog = current_database() and table_schema not in ('information_schema', 'pg_catalog', 'pg_toast')`, rowLimit: 999999, params: [], isDDL: false
        });
        return res.data.map(p => ({ name: p.object_name, type: p.object_type }));
    }

    public async connect(constring: string) {
        this.conn = new Pool({ connectionString: constring });
    }

    private readNext(cursor: any, cnt: number): Promise<QueryResult> {
        return new Promise<QueryResult>((r, x) => cursor.read(cnt, (err: any) => err ? x(err) : cursor.close(r(cursor._result))));
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
                let ddlResults = await this.conn?.query<{ filename: string, otype: string, ddl: string }>(ddlQuery);
                if (ddlResults?.rows) {
                    let ddls: any[] = ddlResults?.rows;
                    for (let ddl of ddls) {
                        if (!final.ddlFiles.hasOwnProperty(ddl.filename)) {
                            final.ddlFiles[ddl.filename] = [];
                        }
                        final.ddlFiles[ddl.filename].push(ddl.ddl);
                    }
                    objectType = ddls.filter(p => p.otype !== "" && p.otype !== null)[0]?.otype;
                }
                query = "SELECT * FROM " + opts.query;
            }

            let rowsAffected = 0;
            if (objectType === "TABLE" || objectType === "VIEW") {
                let params: { [name: string]: any } = {};
                for (let p of opts.params ?? []) {
                    params[p.name.replace(":", "")] = p.value;
                }
                for (let p of Object.keys(params)) {
                    query = query.replace(new RegExp(":" + p, "gi"), ":" + p.toUpperCase());
                }

                let qr = pg(query)(params);
                let client = await this.conn?.connect();

                let cursor = client?.query(new Cursor(qr.text, qr.values));
                let results = await this.readNext(cursor, opts.rowLimit);
                //let results = await this.conn?.query(qr);

                if (results?.fields) {
                    for (let ddl of Object.keys(final.ddlFiles)) {
                        let newlines = ["/* " + results.fields.map(p => p.name).join(", ") + " */", "/* " + results.fields.map(p => "A." + p.name).join(", ") + " */"];
                        final.ddlFiles[ddl] = newlines.concat(final.ddlFiles[ddl]);
                    }
                }
                if (results?.rows) {
                    final.data = results?.rows;
                    let dateFields = results.fields.filter(p => p.dataTypeID === 1082);
                    let dateTimeFields = results.fields.filter(p => p.dataTypeID === 1184);
                    if (dateFields.length > 0 || dateTimeFields.length > 0) {
                        for (let row of final.data) {
                            for (let field of dateFields) {
                                row[field.name] = row[field.name].toISOString().substr(0,10);
                            }
                            for (let field of dateTimeFields) {
                                row[field.name] = row[field.name].toISOString().replace('T', ' ').replace('Z', '');
                            }
                        }
                    }
                    final.dataCount = results?.rows?.length + "/";
                    try {
                        let countResult = await client?.query<{ cnt: string }>("Select count(*) as CNT from (" + qr.text + ") a", qr.values);
                        final.dataCount += countResult?.rows?.[0].cnt ?? "??";
                    } catch {
                        final.dataCount += "??";
                    }
                } else {
                    rowsAffected = results?.rowCount || 0;
                    final.dataCount = rowsAffected?.toString() ?? "";
                }
            }
        } catch (ex) {
            final.output = [ex.toString()];
            final.errorOffset = ex.position - 1 ?? null;
            console.log(ex);
        }

        return final;
    }
}