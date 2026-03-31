# AGENTS.md

## Overview

- `src/test/` holds all automated tests for this extension.
- Tests live here intentionally instead of a root `test/` folder; keep that layout unless the packaging and tooling strategy changes.

## Suite map

- `integration.test.ts`: extension activation, command registration, provider loading, tree rendering, refresh behavior.
- `merry-parser.test.ts`: parser semantics, YAML edge cases, metadata handling, hook detection.
- `cli-detector.test.ts`: `parseGlobalList()` behavior and merry-vs-derry preference.
- `extension.test.ts`: scaffold sample test; low signal; safe to replace once better coverage exists.

## Conventions

- Prefer pure unit tests for parser and CLI helpers.
- Use `test-workspace/` for committed workspace-fixture integration scenarios.
- Use temporary directories for parser file-level edge cases that do not need a full workspace.
- When parser semantics change, update both unit assertions and integration expectations.
- When command ids or provider wiring change, update integration coverage first.

## Anti-patterns

- Do not add new tests under a root `test/` directory.
- Do not make integration tests depend on the developer's globally installed Dart or merry/derry state.
- Do not rely on `extension.test.ts` as evidence that extension behavior is covered.
- Do not silently change fixture script names in `test-workspace/` without updating integration assertions.
