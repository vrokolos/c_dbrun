// Flat config (required since ESLint 9+/10 removed support for .eslintrc.*).
const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");

module.exports = [
    {
        ignores: ["out/**", ".vscode-test/**", "node_modules/**"]
    },
    {
        files: ["src/**/*.ts"],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 2020,
                sourceType: "module"
            }
        },
        plugins: {
            "@typescript-eslint": tsPlugin
        },
        rules: {
            // Equivalent of the old (removed) "@typescript-eslint/class-name-casing" rule.
            "@typescript-eslint/naming-convention": ["warn", { selector: "class", format: ["PascalCase"] }],
            "curly": "warn",
            "eqeqeq": "warn",
            "no-throw-literal": "warn",
            // typescript-eslint dropped its own formatting rules (incl. "semi") in v6+; use core ESLint's instead.
            "semi": "warn"
        }
    }
];
