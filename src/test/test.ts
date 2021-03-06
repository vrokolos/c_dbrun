import { DBRun } from "../dbrun";
import { argv } from "process";
import * as fs from "fs";

let tstart = async () => {
    let inputfile = fs.readFileSync("test.sql", "utf8");
    let con = argv[5] || fs.readFileSync("c:/temp/con.ini", "utf8");
    let limit = 10;
    let cline = 12;
    let ccol = 0;
    let eol = "\r\n";
    
    let db = new DBRun();
    db.extraLog = console.log;
    let out = await db.go({ fileText: inputfile, connectionString: con, rowLimit: limit, currentLine: cline, currentCol: ccol, eol, format: "text" });
    console.log(out.output);
    console.log(out.errorPosition ?? "No Error");
    for (let p of Object.keys(out.files)){
        console.log("File: " + p);
        console.log(out.files[p].join("\n"));
    }
};

tstart();