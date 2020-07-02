const csv = require('csvtojson');

export function matchAll(str: string, regex: RegExp, matches: RegExpExecArray[] = []): RegExpExecArray[] {
    let res = regex.exec(str);
    res && matches.push(res) && matchAll(str, regex, matches);
    return matches;
}

export async function parsecsv(output: string): Promise<any> {
    return await new Promise<any>((r, s) => csv().fromString(output).then((csvRow: string) => { r(csvRow); }));
}