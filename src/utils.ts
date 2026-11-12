export function matchAll(str: string, regex: RegExp, matches: RegExpExecArray[] = []): RegExpExecArray[] {
    let res = regex.exec(str);
    res && matches.push(res) && matchAll(str, regex, matches);
    return matches;
}

const isoDatePattern = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const dmyDatePattern = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:[ ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;

/**
 * Parses a "--:PARAM=VALUE" date value into a JS Date, using an explicit DD/MM/YYYY (or
 * YYYY-MM-DD) interpretation instead of the locale-ambiguous `Date.parse`.
 *
 * `Date.parse` treats slash-separated dates as MM/DD/YYYY, so a DD/MM/YYYY value (the format
 * documented in the README, e.g. "01/01/1900") is silently misread whenever both parts are
 * <= 12 (day/month swapped) and simply fails (returns NaN) whenever the day is > 12 - which in
 * turn made the caller fall back to passing the raw, unconverted string to Oracle instead of a
 * proper DATE bind. Returns null if `value` isn't a recognized date format.
 */
export function parseParamDate(value: string): Date | null {
    let m = isoDatePattern.exec(value);
    if (m) {
        let [, y, mo, d, h, mi, s] = m;
        return new Date(Number(y), Number(mo) - 1, Number(d), Number(h ?? 0), Number(mi ?? 0), Number(s ?? 0));
    }
    m = dmyDatePattern.exec(value);
    if (m) {
        let [, d, mo, y, h, mi, s] = m;
        let day = Number(d);
        let month = Number(mo);
        if (month > 12 && day <= 12) {
            // Tolerate an accidental MM/DD/YYYY input: swap back since month can't be > 12.
            [day, month] = [month, day];
        }
        if (month < 1 || month > 12 || day < 1 || day > 31) {
            return null;
        }
        return new Date(Number(y), month - 1, day, Number(h ?? 0), Number(mi ?? 0), Number(s ?? 0));
    }
    return null;
}

const qQuoteClosers: { [opener: string]: string } = { "[": "]", "{": "}", "(": ")", "<": ">" };

/**
 * Removes SQL/PL-SQL line comments ("--..."), block comments ("/* ... *\/"),
 * regular string literals ('...', including the doubled '' escape), and
 * Oracle's alternative quoting literals (q'[...]', q'{...}', q'<...>', q'(...)', q'!...!' etc.)
 * from `text`, replacing each with a single space so that only executable code remains.
 *
 * This is used before scanning for ":NAME" bind-variable references so that colons that merely
 * appear inside string literals (e.g. date format masks like 'HH24:MI:SS', or dynamic SQL text
 * built for an internal EXECUTE IMMEDIATE ... USING) or inside comments (including apostrophes in
 * english contractions like "don't") are never mistaken for parameters dbrun needs to supply.
 */
export function stripStringsAndComments(text: string): string {
    let result = "";
    let i = 0;
    const n = text.length;
    while (i < n) {
        const ch = text[i];
        const next = text[i + 1];
        if (ch === "-" && next === "-") {
            let end = text.indexOf("\n", i);
            if (end === -1) {
                end = n;
            }
            result += " ".repeat(end - i);
            i = end;
        } else if (ch === "/" && next === "*") {
            let end = text.indexOf("*/", i + 2);
            end = end === -1 ? n : end + 2;
            result += " ".repeat(end - i);
            i = end;
        } else if ((ch === "q" || ch === "Q") && next === "'" && text[i + 2] !== undefined) {
            let opener = text[i + 2];
            let closer = qQuoteClosers[opener] ?? opener;
            let closeSeq = closer + "'";
            let end = text.indexOf(closeSeq, i + 3);
            end = end === -1 ? n : end + closeSeq.length;
            result += " ".repeat(end - i);
            i = end;
        } else if (ch === "'") {
            let j = i + 1;
            while (j < n) {
                if (text[j] === "'") {
                    if (text[j + 1] === "'") {
                        j += 2;
                        continue;
                    }
                    j += 1;
                    break;
                }
                j += 1;
            }
            result += " ".repeat(j - i);
            i = j;
        } else {
            result += ch;
            i += 1;
        }
    }
    return result;
}