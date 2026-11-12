import * as assert from "assert";
import { DBRun } from "../../dbrun";

// Note on `cline`: production call sites (extension.ts) compute it as
// `editor.selection.active.line + 1`, i.e. the cursor's 0-based line index plus one.
// Tests below follow that same convention so they exercise the code the same way the
// extension actually does.

describe("DBRun.GetCurrentQuery", () => {
    it("extracts only the blank-line-delimited block the cursor is in", () => {
        let db = new DBRun();
        let text = "SELECT 1 FROM DUAL\n\nSELECT 2 FROM DUAL";
        // cursor on the 3rd line (0-based index 2) -> cline = 3
        let query = db.GetCurrentQuery(text, "\n", 3).trim();
        assert.strictEqual(query, "SELECT 2 FROM DUAL");
    });

    it("extracts the first block when the cursor is in it", () => {
        let db = new DBRun();
        let text = "SELECT 1 FROM DUAL\n\nSELECT 2 FROM DUAL";
        // cursor on the 1st line (0-based index 0) -> cline = 1
        let query = db.GetCurrentQuery(text, "\n", 1).trim();
        assert.strictEqual(query, "SELECT 1 FROM DUAL");
    });
});

describe("DBRun.FetchQuery", () => {
    it("infers numeric, date and string param types from --:NAME=VALUE declarations", () => {
        let db = new DBRun();
        let text = "--:FROMDATE=05/03/2024\n" +
            "--:LIMIT=10\n" +
            "--:LABEL='hello'\n" +
            "SELECT * FROM EMPLOYEES WHERE HIRE_DATE >= :FROMDATE AND ROWNUM <= :LIMIT AND LABEL = :LABEL";

        let result = db.FetchQuery(text, "\n", 0, 0, false);

        let fromDate = result.params.find(p => p.name === ":FROMDATE");
        assert.ok(fromDate?.value instanceof Date);
        assert.strictEqual((fromDate!.value as Date).getDate(), 5);
        assert.strictEqual((fromDate!.value as Date).getMonth(), 2); // March

        let limit = result.params.find(p => p.name === ":LIMIT");
        assert.strictEqual(limit?.value, 10);

        let label = result.params.find(p => p.name === ":LABEL");
        assert.strictEqual(label?.value, "hello");
    });

    it("flags only genuinely undeclared bind variables as 'needed'", () => {
        let db = new DBRun();
        let text = "--:FROMDATE=05/03/2024\n" +
            "SELECT * FROM EMPLOYEES WHERE HIRE_DATE >= :FROMDATE AND NAME = :NAME";

        let result = db.FetchQuery(text, "\n", 0, 0, false);

        assert.deepStrictEqual(result.paramsNeeded, [":NAME"]);
    });

    it("does not flag bind-variable-looking text inside string literals or comments as needed", () => {
        // Regression test: this is the exact "long package" failure mode reported by a user -
        // an apostrophe in a comment plus a dynamic-SQL string with its own internal bind
        // variables used to desynchronize quote parsing and flood paramsNeeded with bogus entries.
        let db = new DBRun();
        let pkg = [
            "CREATE OR REPLACE PACKAGE BODY PAY_EXPORT AS",
            "  -- don't recompute this every time",
            "  PROCEDURE RUN IS",
            "    l_sql VARCHAR2(4000);",
            "  BEGIN",
            "    l_sql := TO_CHAR(SYSDATE, 'YYYY-MM-DD HH24:MI:SS');",
            "    l_sql := 'INSERT INTO EMPLOYEE_DATA (ORGANIZATION, EMPLOYEE)",
            "              VALUES (:ORGANIZATION, :EMPLOYEE)';",
            "    EXECUTE IMMEDIATE l_sql USING l_org, l_emp;",
            "  END;",
            "END;"
        ].join("\n");

        let result = db.FetchQuery(pkg, "\n", 0, 0, false);

        assert.deepStrictEqual(result.paramsNeeded, []);
    });

    it("replaces declared params in-place when replaceParams is true", () => {
        let db = new DBRun();
        let text = "--:THEID=3\nSELECT :THEID FROM DUAL";
        let result = db.FetchQuery(text, "\n", 0, 0, true);
        assert.ok(result.query.includes("SELECT 3 FROM DUAL"));
    });
});
