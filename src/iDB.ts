export interface Executor {
    exec(opts: ExecIn): Promise<ExecOut>;
}

export class ExecOut {
    output: string[] = [];
    data: any[] = [];
    dataCount: string = "";
    ddlFiles: { [filename: string]: string[] } = {};
    errorOffset: number | null = null;
}

export class ExecIn {
    connectionString: string = "";
    query: string = "";
    rowLimit: number = 10;
    isDDL: boolean = false;
}