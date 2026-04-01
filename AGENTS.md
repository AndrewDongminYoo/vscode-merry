# AGENTS.md

## Overview

- `vscode-merry-scripts` is a VS Code extension for Dart/Flutter workspaces.
- It discovers merry/derry scripts from `pubspec.yaml` and optional external YAML, renders them in the Explorer, and runs them via the detected CLI.
- Use this file for repo navigation. Use `CLAUDE.md` for the longer architecture narrative and constraints.

## Documentation map

- `CLAUDE.md`: architecture, parser semantics, commands, product constraints.
- `AGENTS.md` (root): repo map, edit boundaries, cross-cutting conventions.
- `src/AGENTS.md`: runtime code ownership and file-level guidance.
- `src/test/AGENTS.md`: test strategy, suite boundaries, fixture usage.
- `test-workspace/AGENTS.md`: integration fixture contract.
- `.serena/memories/`: compact persistent context for future sessions.

## Structure

- `src/`: extension runtime code.
- `src/test/`: unit and integration tests. Tests live here intentionally, not in a root `test/` folder.
- `test-workspace/`: committed fixture workspace used by integration tests.
- `docs/plans/`: design and implementation notes.
- `package.json`: extension manifest, contributions, npm scripts.
- `esbuild.js`: bundle/watch entry.

## Where to look

- Command wiring and terminal behavior: `src/extension.ts`
- CLI detection and merry-vs-derry preference: `src/cli-detector.ts`
- YAML parsing and script tree semantics: `src/merry-parser.ts`
- Tree provider, reload logic, file watchers: `src/merry-scripts-provider.ts`
- Tree item presentation: `src/script-item.ts`
- End-to-end extension behavior: `src/test/integration.test.ts`
- Parser regression coverage: `src/test/merry-parser.test.ts`
- CLI parser coverage: `src/test/cli-detector.test.ts`

## Commands

- `pnpm install`
- `pnpm run check-types`
- `pnpm run lint`
- `pnpm run compile`
- `pnpm run package`
- `pnpm run test`
- `pnpm run watch`
- `F5` in VS Code for Extension Development Host smoke tests

## Conventions

- TypeScript strict mode is enabled; keep types narrow and explicit.
- Double quotes, semicolons, trailing commas, and guard clauses are the prevailing style.
- Runtime files use kebab-case by convention; this is not currently enforced by ESLint.
- Tests stay under `src/test/` as part of the current VSIX-oriented layout.
- Parser and provider changes usually require both unit-test and integration-test updates.

## Anti-patterns

- Do not reintroduce a top-level `test/` directory without also changing the toolchain and docs.
- Do not add a fallback script runner when the CLI is missing; current product scope is install prompt only.
- Do not duplicate large architecture explanations in child `AGENTS.md` files; keep those scoped.
- Do not treat `src/test/extension.test.ts` as meaningful coverage.

## Notes

- `README.md` and `vsc-extension-quickstart.md` still contain scaffold-era material; prefer `CLAUDE.md` and the AGENTS hierarchy for implementation context.
- `test-workspace/` is intentionally committed because integration tests depend on stable script names, nesting, and hook examples.
