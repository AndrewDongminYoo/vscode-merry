# Suggested commands for vscode-merry

## Setup and install

- `pnpm install` — install dependencies.

## Build and verification

- `pnpm run check-types` — strict TypeScript check without emitting files.
- `pnpm run lint` — lint `src/` with ESLint.
- `pnpm run compile` — runs type-check + lint + dev bundle build.
- `pnpm run package` — runs type-check + lint + production bundle build.
- `pnpm run test` — compiles tests + extension, lints, then launches `vscode-test`.

## Watch / local development

- `pnpm run watch` — parallel esbuild watch + `tsc --watch`.
- `pnpm run watch-tests` — watch test compilation to `out/`.
- `node esbuild.js --watch` — direct esbuild watch if you only need bundling.
- In VS Code, press `F5` to launch an Extension Development Host for manual smoke testing.

## Useful repo inspection commands on macOS

- `git status`
- `git diff --stat`
- `rg pattern src test`
- `rg --files src test`
- `find . -name 'AGENTS.md' -o -name 'CLAUDE.md'`
- `ls`
- `cd <path>`
- `sed -n '1,200p' <file>`
