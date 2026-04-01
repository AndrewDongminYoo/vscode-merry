# Style and conventions for vscode-merry

## Language and formatting

- TypeScript project with `strict: true` and additional no-implicit / no-unused checks.
- Double quotes, semicolons, trailing commas, and early-return guards are the prevailing style.
- Keep comments sparse and purposeful.

## Naming and layout

- Runtime source files use kebab-case by convention.
- Classes, interfaces, and types use PascalCase.
- Functions, locals, and module state use camelCase.
- Tests live in `src/test/` by design; do not assume a root `test/` directory.
- VS Code command ids use the `merry.*` namespace.

## Architectural conventions

- Keep parser logic independent from VS Code APIs so it remains unit-testable.
- Preserve the `merry`-before-`derry` preference when both CLIs are available.
- Preserve space-delimited nested script paths such as `build android`.
- Treat `test-workspace/` as stable test input, not a scratch directory.

## Lint facts

- ESLint warns on import naming convention, missing curly braces, non-strict equality, literal throws, and missing semicolons.
- File naming is currently a convention, not a rule enforced by ESLint.
