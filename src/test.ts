import {DBRun} from "./dbrun";
import { argv } from "process";
import * as fs from "fs";

let tstart = async () => {
    let inputfile = fs.readFileSync("test.sql", "utf8");
    let con = argv[5] || fs.readFileSync("c:/temp/con.ini", "utf8");
    let limit = 10;
    let cline = 0;
    let ccol = 0;
    let eol = "\r\n";
    let db = new DBRun();
    let out = await db.go({inputfile, con, limit, cline, ccol, eol, format: "text"});
};

tstart();