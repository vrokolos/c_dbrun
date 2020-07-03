export function matchAll(str: string, regex: RegExp, matches: RegExpExecArray[] = []): RegExpExecArray[] {
    let res = regex.exec(str);
    res && matches.push(res) && matchAll(str, regex, matches);
    return matches;
}