# What to do when a task is completed in vscode-merry

- Run `pnpm run check-types` for any TypeScript change.
- Run `pnpm run lint` for source changes.
- Prefer `pnpm run compile` as the standard all-in verification for normal code changes because it covers type-check, lint, and bundle generation.
- Run `pnpm run test` when behavior, activation, parsing, or view/command logic changes.
- If you touch bundling or release-related code, also run `pnpm run package`.
- For extension UX changes, smoke-test in a VS Code Extension Development Host with `F5` against a workspace that contains `pubspec.yaml` and/or merry/derry script files.
- Keep in mind that `test/extension.test.ts` is currently just the default sample test, so manual verification still matters.
- Treat `CLAUDE.md` as the source of truth for repo-specific architecture and constraints until `README.md` is rewritten.
