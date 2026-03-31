# Style and conventions for vscode-merry

## Language and typing

- TypeScript project with `strict: true` and additional strictness flags (`noImplicitAny`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`).
- Prefer explicit, narrow types for VS Code state such as `vscode.Terminal | null`.
- Keep functions small and direct; the code favors straightforward control flow over heavy abstraction.

## Naming and file layout

- Source filenames use kebab-case: `merry-parser.ts`, `merry-scripts-provider.ts`, `script-item.ts`.
- Classes/interfaces/types use PascalCase: `MerryScriptsProvider`, `ScriptItem`, `ScriptNode`, `ParseResult`.
- Functions, locals, and module-level state use camelCase.
- VS Code command ids use the `vscode-merry.*` namespace.

## Formatting patterns seen in the codebase

- Double quotes, semicolons, and trailing commas are used consistently.
- Early-return guard clauses are common.
- Comments are sparse and should stay purposeful; only add short clarifying comments where the code is not obvious.
- Small inline callbacks for command registration and event handlers are acceptable.

## Lint rules called out by config

- Enforce/warn on import naming convention using camelCase or PascalCase.
- Warn on missing curly braces.
- Warn on non-strict equality (`eqeqeq`).
- Warn on throwing literals.
- Warn on missing semicolons.

## Domain-specific parser rules worth preserving

- `scripts: string` means load scripts from an external YAML file.
- `scripts: map` means parse inline script definitions.
- Map entries with `(scripts)` are leaf scripts with metadata like `(description)` and `(workdir)`.
- Map entries without `(scripts)` are groups.
- Keys matching `/^\(\w+\)$/` are metadata and should not become script nodes.
- Nested script execution paths are space-delimited.
