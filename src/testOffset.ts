
function getPositionFromOffset(text: string, offset: number, eol: string): { line: number, col: number } | null {
    let r = { line: 0, col: 0 };
    console.log(offset);
    console.log(text.substr(offset, 1));
    let curPos = 0;
    let lineNo = 1;
    for (let line of text.split(eol)) {
        let lineOffset = curPos;
        let lineLength = line.length + eol.length;
        if (lineOffset + lineLength > offset) {
            /*this is the line*/

            console.log(lineNo + " " + curPos + " " +  lineOffset + " [This is the line]");
            curPos += lineLength;
            r.line = lineNo;
            r.col = offset - lineOffset;
            return r;
        } else {
            /* this is not the line */
            console.log(lineNo + " " + curPos + " " + lineLength + " " +  lineOffset + " [This is not the line]");
            curPos = curPos + lineLength;
        }
        lineNo ++;
    }
    return null;
}


let text = `select 1a\r\nfrom (\r\n    select * from d\r\n)`;
console.log(getPositionFromOffset(text, 37, "\r\n"));

/*
1
11
19
40
*/