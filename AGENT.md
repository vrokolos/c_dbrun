# AGENT.md

Guidance for AI coding agents working in this repository.

## What this is

`dbrun` is a VS Code extension (early beta) that lets you run SQL commands against a
database directly from a `.sql` file in the editor, without a full SQL client UI.
Results are printed as an ASCII table (or CSV / INSERT statements) either to the
"dbrun" Output channel or to a new untitled editor tab.

Supported backends: **Oracle** (via `oracledb`) and **PostgreSQL** (via `pg` /
`pg-cursor`), selected automatically from the connection string.

## Project layout

- [src/extension.ts](/src/extension.ts) — VS Code extension entry point. Registers commands/keybindings,
  reads `dbrun.connection(s)`/`dbrun.rowLimit` settings, wires the status bar
  "choose connection" button, opens output in the Output channel or a new editor tab,
  and applies inline edits back into the SQL file (auto-inserted `--:PARAM=null`
  placeholders, cursor jump to error position, DDL reload-in-place for `kind: 3`).
- [src/dbrun.ts](/src/dbrun.ts) — core, UI-independent engine (`DBRun` class). Responsible for:
  - Extracting the "current query" or "current word" around the cursor
    (`GetCurrentQuery`/`GetCurrentWord`) — queries are separated by blank lines.
  - Parsing `--:PARAM=VALUE` parameter declarations and detecting which bind
    parameters (`:NAME`) are still needed (`FetchQuery`).
  - Picking/connecting the right `Executor` based on the connection string prefix
    (`connect`): `postgres...` → Postgres, anything else → Oracle.
  - Formatting result sets as text table / CSV / INSERT statements (`show`).
  - Mapping a DB error's character offset back to a `{ line, col }` position in the
    original file (`getPositionFromOffset`).
- [src/iDB.ts](/src/iDB.ts) — shared `Executor` interface and the `ExecIn`/`ExecOut`/`ExecParam` DTOs
  that every backend implements against.
- [src/executors/oracle.ts](/src/executors/oracle.ts), [src/executors/postgres.ts](/src/executors/postgres.ts) —
  one `Executor` implementation per backend. Each knows how to connect, run a
  query with a row limit, fetch a total row count, generate DDL for `describeObject`
  (`qryDDL`), and look up post-compile errors for PL/SQL objects (`errorQry`).
- [src/autocomplete.ts](/src/autocomplete.ts) — `SqlAutoComplete`, a `CompletionItemProvider` for the `sql`
  language that lazily fetches and caches table/view/function/procedure/package
  names via `DBRun.getObjects`. `refresh()` clears the cache (wired to the
  `dbrun.refreshSchemaCache` command) and `setConnection()` updates the connection
  used for autocomplete and clears the cache if it changed (called whenever the
  active connection changes via `dbrun.chooseConnection`/`dbrun.reconnect`).
- [src/utils.ts](/src/utils.ts) — shared parsing helpers: `matchAll` (recursive "find all regex
  matches"), `stripStringsAndComments` (masks out `--`/`/* */` comments, `'...'` string
  literals incl. the `''` escape, and Oracle `q'[...]'`-style literals — used before
  scanning for `:NAME` bind variables so colons inside strings/comments are never
  misdetected as needed params), and `parseParamDate` (explicit `DD/MM/YYYY`/ISO date
  parsing for `--:PARAM=VALUE` values, deliberately not using the locale-ambiguous
  `Date.parse`).
- [src/test/test.ts](/src/test/test.ts) — a manual ad-hoc script (not part of the Mocha suite) that runs
  `DBRun.go` against `test.sql` using a connection string from `c:/temp/con.ini` or
  argv; useful for manually exercising a change against a real DB connection.
  [src/test/testOffset.ts](/src/test/testOffset.ts) is a scratch file for the offset→line/col math.
  [src/test/unit/](/src/test/unit) contains the real automated Mocha unit tests (pure-logic,
  no VS Code/DB dependency) — see "Build / lint / test commands" below.
- [package.json](/package.json) — extension manifest: commands, keybindings, `dbrun.connection`,
  `dbrun.connections`, `dbrun.rowLimit` settings, and the `dbrun` log-output language
  (syntax-highlighted via [dbrun.tmLanguage](/dbrun.tmLanguage)).
- [snippets/sql.json](/snippets/sql.json) — SQL snippets contributed for the `sql` language.

## Key conventions / behaviors to preserve

- **Current query detection**: a query is the block of non-blank lines around the
  cursor; blank lines are the delimiter. Don't change this without checking
  `GetCurrentQuery` and the README's "Usage" section stays accurate.
- **Don't terminate queries with `;`** — the extension expects bare statements.
- **Query parameters**: declared at the top of a `.sql` file as
  `--:PARAM=VALUE` and referenced as `:PARAM` in the query; type is inferred
  (number / quoted string / date / fallback string) in `FetchQuery`. If a `:PARAM`
  is referenced but not declared, `dbrun` auto-inserts a `--:PARAM=null` line above
  the query on next run (see `output.newParams` handling in `extension.ts`).
- **Transactions**: Oracle sessions have autocommit OFF (explicit `commit` SQL
  required); Postgres sessions have autocommit ON. This asymmetry is intentional —
  see README "Transactions" section.
- **`kind` values** for the generic `dbrun.run` command: `0` execute whole file,
  `1` execute current query, `2` describe current word/object (fetch DDL via
  `qryDDL` + `getObjects`), `3` reload current object definition from the DB back
  into the editor in place.
- **Executor selection is purely prefix-based** on the connection string
  (`postgres...`, else Oracle) in `DBRun.connect` — keep new backends
  consistent with this pattern and update the README's connection-string formats
  table if you add one.
- Executors are lazily `import()`ed in `DBRun.connect` so the Oracle/Postgres
  native dependencies aren't loaded unless that backend is actually used.
- Row counts are fetched as a secondary `COUNT(*)` query after the row-limited
  result set in both Oracle and Postgres executors; keep this pattern if you touch
  query execution (`dataCount` format is `"<fetched>/<total>"`).
- `dbrun.connection` defaults to `""` and `dbrun.connections` defaults to `{}` in
  [package.json](/package.json)'s configuration schema — keep the schema `default` type-matched
  to the setting's `type`. These previously defaulted to the boolean `false`, which
  is falsy but not `null`/`undefined`, so `conf.get(...) ?? fallback` calls in
  `extension.ts` silently returned `false` instead of the intended empty string/object,
  which could reach `conString.startsWith(...)` in `DBRun.connect` and throw. Use
  `extension.ts`'s `getDefaultConnectionString()`/`getNamedConnections()` helpers
  (which use `||`, not `??`) rather than reading `vscode.workspace.getConfiguration`
  directly, to stay defensive against any stale falsy values already saved in a
  user's settings.

## Build / lint / test commands

Run from the repository root (`npm install` first if `node_modules` is missing):

- `npm run compile` — `tsc -p ./` (compiles `src/**` to `out/`, per [tsconfig.json](/tsconfig.json),
  target `ES2019`).
- `npm run watch` — `tsc -watch -p ./`.
- `npm run lint` — `eslint src` (flat config in [eslint.config.js](/eslint.config.js); ESLint 10 +
  `@typescript-eslint` v8 no longer support the legacy `.eslintrc.json` format).
  Rules: `curly`/`eqeqeq`/`no-throw-literal`/`semi` warnings, plus
  `@typescript-eslint/naming-convention` (PascalCase classes) replacing the removed
  `class-name-casing` rule.
- `npm test` — runs `pretest` (`compile` + `lint`) then `mocha "out/test/unit/**/*.test.js"`.
  This runs the real automated unit suite in [src/test/unit/](/src/test/unit) (pure logic only:
  `DBRun.GetCurrentQuery`/`FetchQuery`, `matchAll`, `stripStringsAndComments`,
  `parseParamDate` — no VS Code or live DB dependency). Add new test files there;
  they're picked up automatically by the glob.
- `npm run package` — `vsce package`, builds the `.vsix` (see existing
  `dbrun-0.3.7.vsix` / `dbrun-0.3.8.vsix` artifacts in the repo root).

After editing `src/*.ts`, prefer `npm run compile && npm test` as the smallest
verification step — it now actually exercises the parsing logic, unlike before.
Manual, DB-dependent verification is still done via [src/test/test.ts](/src/test/test.ts) against a
real connection, or by pressing `F5` in VS Code to launch an Extension
Development Host.

## Installed extension vs. local checkout

The `dbrun` extension is published on the **VS Code Marketplace**
(`https://marketplace.visualstudio.com/items?itemName=iosifak.dbrun`, publisher
`iosifak` / "Iosif Karaioannoglou"), and on this machine it is installed from the
Marketplace into `%USERPROFILE%\.vscode\extensions\iosifak.dbrun-<version>` — a
plain materialized folder (not a symlink back into this repo). You can confirm an
install's origin by checking `%USERPROFILE%\.vscode\extensions\extensions.json` /
the extension's own `package.json`: a Marketplace install carries a `__metadata`
block with gallery-assigned `id`/`publisherId` GUIDs and a `publisherDisplayName`;
these are populated by VS Code's gallery lookup and are a reliable signal of a
Marketplace (or at least gallery-matched) install.

**The installed copy is independent of this working tree** and does not
auto-update when you edit source here. If the installed version (e.g. `0.3.7`)
lags behind `version` in [package.json](/package.json) (e.g. `0.3.8`) and/or there are
uncommitted local changes, the running extension is stale relative to the repo.
To actually exercise local changes in a real VS Code window, either:
- Press `F5` from this repo to launch an Extension Development Host (loads source
  directly, no packaging needed), or
- `npm run package` (runs `vsce package`) to produce a new `.vsix`, then
  `code --install-extension dbrun-<version>.vsix` to sideload it over the
  Marketplace-installed copy.

## Misc

- TypeScript is strict (`"strict": true`), target `ES2019`, module `commonjs`.
  `tsconfig.json`'s `"types"` is explicitly `["node", "mocha"]` (needed so the
  `describe`/`it` globals resolve in `src/test/unit/`); `@types/vscode` still
  resolves fine since it's an ambient module import, not a global.
- The extension is published by `iosifak`; version is bumped in [package.json](/package.json) and
  mirrored in commit messages (e.g. `0.3.7 reloadObject`).
- `CHANGELOG.md` currently just says "Initial release" — update it when making
  user-facing changes if you also bump the version.
- `npm audit` still reports some moderate-severity transitive findings (currently in
  `minimatch`, pulled in by `eslint`/`@typescript-eslint`'s own dependencies) that
  aren't fixable without downgrading those dev tools; this only affects the dev
  toolchain, not the packaged extension or its runtime dependencies.
