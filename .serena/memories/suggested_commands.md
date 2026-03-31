# Suggested commands for vscode-merry

## Setup

- `pnpm install` — install dependencies.

## Core verification

- `pnpm run check-types` — strict TypeScript type-check.
- `pnpm run lint` — lint runtime code under `src/`.
- `pnpm run compile` — standard local verification: type-check + lint + dev bundle.
- `pnpm run package` — production bundle verification.
- `pnpm run test` — compile tests, compile extension, lint, then run `vscode-test`.

## Active development

- `pnpm run watch` — esbuild watch plus `tsc --watch`.
- `pnpm run watch-tests` — test compilation watch.
- `node esbuild.js --watch` — bundler-only watch.
- `F5` in VS Code — launch an Extension Development Host for smoke testing.

## When to use what

- Parser-only or helper changes: start with `pnpm run check-types`, `pnpm run lint`, and targeted test awareness.
- Provider, activation, command, or manifest changes: finish with `pnpm run test` and a manual `F5` smoke test.
- Release-oriented bundle changes: include `pnpm run package`.
