import { defineConfig } from "@vscode/test-cli";

export default defineConfig([
  {
    // Unit tests — no workspace required
    files:
      "out/test/{extension,merry-parser,cli-detector,merry-codelens-provider,toolchain-environment}.test.js",
  },
  {
    // Integration tests — open test-workspace so the extension activates
    files:
      "out/test/{integration,merry-task-provider,merry-execution-service}.test.js",
    workspaceFolder: "./test-workspace",
  },
]);
