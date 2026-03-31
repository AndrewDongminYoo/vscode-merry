# AGENTS.md

## Overview

- `test-workspace/` is the committed fixture workspace opened by integration tests.
- It exists to give the extension a stable Dart/Flutter-like project with `pubspec.yaml` and external `merry.yaml`.

## What matters here

- `pubspec.yaml`: workspace anchor for extension activation and script-source resolution.
- `merry.yaml`: canonical script tree fixture, including nested groups and hook-style names.
- `lib/main.dart`: minimal app file so the workspace looks like a real Flutter/Dart project.

## Conventions

- Keep script names, nesting, descriptions, and hook examples stable unless the tests are intentionally being updated.
- Prefer representative fixture data over exhaustive or noisy examples.
- Treat this directory as test input, not as a sandbox for generated outputs.

## Anti-patterns

- Do not hand-edit `.dart_tool/` contents unless the fixture bootstrap process changes.
- Do not add machine-specific paths or local-only artifacts.
- Do not change `merry.yaml` structure casually; `src/test/integration.test.ts` asserts against it.
