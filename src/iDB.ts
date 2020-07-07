import { Position } from "./dbrun";

export interface Executor {
    exec(opts: ExecIn): Promise<ExecOut>;
    getObjects(connectionString: string): Promise<{ name: string, type: string }[]>;
}

export class ExecOut {
    output: string[] = [];
    data: any[] = [];
    dataCount: string = "";
    ddlFiles: { [filename: string]: string[] } = {};
    errorOffset: number | null | Position = null;
}

export class ExecIn {
    connectionString: string = "";
    query: string = "";
    params?: ExecParam[] = [];
    rowLimit: number = 10;
    isDDL: boolean = false;
}

export class ExecParam {
    name: string;
    value: any;

    constructor(name: string) {
        this.name = name;
    }
}