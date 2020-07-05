# dbrun (EARLY BETA)
Run SQL commands. **Only oracle support currently**. 

## Configuration
Used in vscode settings:

KEY | DESCRIPTION
-- | --
dbrun.connection | Connection string to be used in this format: **username/password@host:port/servicename**
dbrun.rowLimit | Number of records to fetch when executing queries that return resultsets. **Default: 10**

## Example Output

```
Rows: [10/35]        Time: 161 ms
┌───────────────────────────────┐
│ ID   ENABLED  CODE  THE_ORDER │
├───────────────────────────────┤
│ 138  1              15        │
│ 129  1        999             │
│ 130  1        999             │
│ 1    1        259   10        │
│ 2    1        260   11        │
│ 3    1        261   13        │
│ 61   1        999             │
│ 62   1        999             │
│ 63   1        999             │
│ 64   1        999             │
└───────────────────────────────┘
```

If the output window get wrapped and messes your results up use this in your vscode settings file: 

``` js
	"[Log]": { "editor.wordWrap": "off" }
```


## Default Shortcuts
For use only in "sql" language files (ctrl-k m sql)

KEY | ACTION
-|-
f4 | describe current object (word)
f9 | execute current file
ctrl+enter | execute current query. Output: VsCode Output
ctrl+shift+enter | execute current query. Output: New Editor

## Usage

To find the current query it grabs the block the cursor resides in vs code. It gets the string between the first blank lines starting from the cursor positions.

Do not end your commands with a semicolon ";", it will result in an error being thrown

## dbrun.run

This is a generic command that accepts one single json object with these properties to be used in custom keybindings
``` js
{
	kind?: number = 0;
	newwindow?: boolean = false;
	format?: string = "text";
}
```

ARG | VALUE | DESCRIPTION
-- | -- | --
kind | 0 | executes whole file **(default)**
kind | 1 | executes current query 
kind | 2 | describes current word / object
newwindow |false | pipes all output to vsCode output panel **(default)**
newwindow | true | pipes data output to a new vsCode editor and all other output to vscode output panel
format | "text" | generates text ascii data table for resultsets **(default)**
format | "csv" | generates csv table for resultsets

## Query Parameters
You can use parameters in your files like ":THEID"

At the beggining of your sql file you should add each parameter using this format: "--:PARAM=VALUE"

Example:
``` sql
--:THEID=3
--:THEDATE=01/01/1900
--:THESTRING=HELLO
SELECT :THEDATE AS DATEVAL, 
       :THESTRING AS STRINGVAL, 
       :THEID AS NUMBERVAL 
FROM DUAL
```

dbrun tries to automatically detect the type of the parameter using sophisticated skynet-level AI: if (parsed != nan) etc

## Transactions
Everything is run under a single transaction and you should run "commit" to commit the changes

**AUTOCOMMIT IS OFF**