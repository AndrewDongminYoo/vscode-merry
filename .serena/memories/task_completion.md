# What to do when a task is completed in vscode-merry

- Run `pnpm run check-types` for any TypeScript change.
- Run `pnpm run lint` for source changes.
- Prefer `pnpm run compile` as the standard baseline verification.
- Run `pnpm run test` when parser behavior, provider behavior, activation, command wiring, or fixture expectations change.
- Run `pnpm run package` when bundling or release behavior is touched.
- For UX or integration-sensitive changes, launch an Extension Development Host with `F5` against this repo or the committed `test-workspace/` fixture.
- If you move directories or change workflow conventions, update `CLAUDE.md`, the relevant `AGENTS.md`, and any stale Serena memories in the same change.
- Do not treat `src/test/extension.test.ts` alone as meaningful regression coverage.
