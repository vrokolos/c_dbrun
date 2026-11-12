import * as assert from "assert";
import { matchAll, parseParamDate, stripStringsAndComments } from "../../utils";

describe("matchAll", () => {
    it("returns every match of a global regex, not just the first", () => {
        let matches = matchAll("a=1, b=2, c=3", /(\w)=(\d)/g);
        assert.deepStrictEqual(matches.map(m => [m[1], m[2]]), [["a", "1"], ["b", "2"], ["c", "3"]]);
    });

    it("returns an empty array when there are no matches", () => {
        assert.deepStrictEqual(matchAll("no digits here", /\d+/g), []);
    });
});

describe("stripStringsAndComments", () => {
    it("blanks out line comments but keeps everything else intact", () => {
        let result = stripStringsAndComments("SELECT 1 -- a comment\nFROM DUAL");
        assert.ok(!result.includes("comment"));
        assert.ok(result.includes("SELECT 1"));
        assert.ok(result.includes("FROM DUAL"));
    });

    it("blanks out block comments", () => {
        let result = stripStringsAndComments("SELECT /* multi\nline */ 1 FROM DUAL");
        assert.ok(!result.includes("multi"));
        assert.ok(!result.includes("line"));
        assert.ok(result.includes("SELECT"));
        assert.ok(result.includes("FROM DUAL"));
    });

    it("blanks out regular string literals, including the doubled '' escape", () => {
        let result = stripStringsAndComments("SELECT 'it''s a test: not a bind var' FROM DUAL");
        assert.ok(!result.includes(":"));
        assert.ok(result.includes("SELECT"));
        assert.ok(result.includes("FROM DUAL"));
    });

    it("blanks out Oracle q-quote literals with bracket delimiters", () => {
        let result = stripStringsAndComments("SELECT q'[literal with a colon: here]' FROM DUAL");
        assert.ok(!result.includes("colon"));
        assert.ok(result.includes("FROM DUAL"));
    });

    it("does not let an apostrophe inside a comment desynchronize string parsing for the rest of the file", () => {
        // Regression test: a contraction like "don't" inside a "--" comment used to be treated as
        // the start of a string literal, corrupting every subsequent real string in the file.
        let text = "-- don't recompute this every time\n" +
            "SELECT TO_CHAR(SYSDATE, 'HH24:MI:SS') AS NOWTS FROM DUAL";
        let result = stripStringsAndComments(text);
        assert.ok(!result.includes("HH24"));
        assert.ok(!result.includes(":MI"));
        assert.ok(result.includes("SELECT"));
        assert.ok(result.includes("FROM DUAL"));
    });
});

describe("parseParamDate", () => {
    it("parses DD/MM/YYYY (the documented dbrun param format), not MM/DD/YYYY", () => {
        // 05/03 is ambiguous (both parts <= 12): must be read as 5 March, not 3 May.
        let d = parseParamDate("05/03/2024");
        assert.ok(d instanceof Date);
        assert.strictEqual(d!.getDate(), 5);
        assert.strictEqual(d!.getMonth(), 2); // 0-based: March
        assert.strictEqual(d!.getFullYear(), 2024);
    });

    it("parses a day > 12 as DD/MM/YYYY (unambiguous, previously failed with Date.parse)", () => {
        let d = parseParamDate("31/12/2023");
        assert.ok(d instanceof Date);
        assert.strictEqual(d!.getDate(), 31);
        assert.strictEqual(d!.getMonth(), 11); // December
        assert.strictEqual(d!.getFullYear(), 2023);
    });

    it("parses ISO (YYYY-MM-DD) dates", () => {
        let d = parseParamDate("2024-03-05");
        assert.ok(d instanceof Date);
        assert.strictEqual(d!.getDate(), 5);
        assert.strictEqual(d!.getMonth(), 2);
        assert.strictEqual(d!.getFullYear(), 2024);
    });

    it("parses an optional time component", () => {
        let d = parseParamDate("31/12/2023 23:59:59");
        assert.ok(d instanceof Date);
        assert.strictEqual(d!.getHours(), 23);
        assert.strictEqual(d!.getMinutes(), 59);
        assert.strictEqual(d!.getSeconds(), 59);
    });

    it("returns null (not a wrong/garbage date) for unrecognized or invalid input", () => {
        assert.strictEqual(parseParamDate("13/13/2024"), null);
        assert.strictEqual(parseParamDate("hello world"), null);
    });
});
