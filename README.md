# dbrun (EARLY BETA)
Run SQL commands. **Only oracle support currently**

## Configuration
In your settings set **dbrun.connection** with this format: "username/password@host:port/servicename"

## Default Shortcuts
 For use only in .sql files

 KEY | ACTION
 -|-
 f4 | describe current object (word)
 f9 | execute current file
 ctrl+enter | execute current query. Output: VsCode Output
 ctrl+shift+enter | execute current query. Output: New Editor

## Usage

The current query grabs the block the cursor resides in vs code. It grabs the block between the first blank lines starting from the cursor positions.

Do not end your commands with a semicolon ";". 

It will result in an error being thrown

## dbrun.run

This is a generic command that accept one single json object with these properties to be used on custom keybindings
``` js
{
	kind?: number = 0;
	newwindow?: boolean = false;
	format?: string = "text";
}
```
arg | type | description 
- | - |-
kind | 0 | executes whole file **(default)**
 | | 1 | executes current query 
 | | 2 | describes current word / object
newwindow |false | pipes all output to vsCode output panel
| | true | pipes data output to a new vsCode editor and all other output to vscode output panel
format | "text" | generates text ascii data table for resultsets
| | "csv" | generates csv table for resultsets

## Query Parameters
You can use parameters in your files like ":THEID"

At the beggining of your sql file you should add each parameter with the "--:PARAM=VALUE" style
example
``` sql
--:THEID=3
--:THEDATE=TO_DATE('01/01/1900', 'dd/mm/yyyy')
--:THESTRING='HELLO'
SELECT :THEDATE AS DATEVAL, 
       :THESTRING AS STRINGVAL, 
       :THEID AS NUMBERVAL 
FROM DUAL
```

Currently these get substituted during executions and they're not bound by oracle

## Transactions
Everything is run under a single transaction and you should run "commit" to commit the changes

**AUTOCOMMIT IS OFF**
