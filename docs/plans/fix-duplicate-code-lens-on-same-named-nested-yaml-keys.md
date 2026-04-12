# Plan: Fix duplicate CodeLens on same-named nested YAML keys

## Context

When a merry.yaml has two nodes with the same label at different nesting depths (e.g., a top-level `dev` key and a nested `firebase > config > dev` key), `MerryCodeLensProvider.findKeyLine` uses `Array.findIndex` which always returns the **first** match in the file. Both CodeLens objects therefore get placed on that same line, and VS Code renders them inline as:

```bash
$(play) Run: dev | $(play) Run: firebase config dev
```

The user demonstrated this by adding `development: (aliases): dev` alongside `firebase: config: dev:` — making the scenario realistic. The bug affects any two nodes that share the same leaf label.

## Root Cause

`src/merry-codelens-provider.ts` — `findKeyLine(key, lines)`:

```typescript
private findKeyLine(key: string, lines: string[]): number {
  ...
  return lines.findIndex((line) => pattern.test(line));  // ← first match only
}
```

Call site in `collectLenses` passes only the leaf label:

```typescript
const lineIndex = this.findKeyLine(node.label, lines);
```

## Fix

### `src/merry-codelens-provider.ts`

Change `findKeyLine` to accept the full path segments and search **sequentially**
— locate the parent key first, then search only the lines that follow it for the child key. Repeat for every segment in the path.

```typescript
// New signature: receives path segments instead of a single label
private findKeyLine(pathSegments: string[], lines: string[]): number {
  let searchStart = 0;
  let foundLine = -1;

  for (const segment of pathSegments) {
    let pattern = this.regExpCache.get(segment);
    if (!pattern) {
      const escaped = segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      pattern = new RegExp(`^\\s*${escaped}\\s*:`);
      this.regExpCache.set(segment, pattern);
    }

    foundLine = -1;
    for (let i = searchStart; i < lines.length; i++) {
      if (pattern.test(lines[i])) {
        foundLine = i;
        searchStart = i + 1;
        break;
      }
    }

    if (foundLine === -1) return -1;
  }

  return foundLine;
}
```

Update the call site in `collectLenses`:

```typescript
// Before:
const lineIndex = this.findKeyLine(node.label, lines);

// After:
const lineIndex = this.findKeyLine(node.fullPath.split(" "), lines);
```

### Why this works

For `firebase config dev` (pathSegments = `["firebase", "config", "dev"]`):

1. Find `firebase:` → line 101
2. Find `config:` **after** line 101 → line 120
3. Find `dev:` **after** line 120 → line 121 ✓

For top-level `dev` (pathSegments = `["dev"]`):

1. Find `dev:` starting at line 0 → line 0 ✓

No collision — each node resolves to its own distinct line.

The `regExpCache` is unaffected: it still caches `RegExp` objects by segment string, which is valid since the same segment name reuses the same pattern.

## Critical files

- `src/merry-codelens-provider.ts` — only file to change (lines 57, 79–88)
- `test-workspace/merry.yaml` — already modified by user to demonstrate the scenario
- `src/test/integration.test.ts` — consider adding a regression test

## Verification

1. `pnpm run compile` — confirm no type errors.
2. Press F5 in VS Code to open Extension Development Host with `test-workspace/`.
3. Open `test-workspace/merry.yaml` in the editor.
4. Confirm each script block has exactly ONE "▷ Run: ..." CodeLens above it, with the correct full path (e.g., `Run: firebase config dev` appears above the nested `dev:` block, not above `development:`).
5. Confirm `development:` shows `Run: development` (not `Run: dev`).
6. `pnpm run test` — existing tests should still pass.
