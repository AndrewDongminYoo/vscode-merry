import { defineConfig } from "@vscode/test-cli";

export default defineConfig([
  {
    // Unit tests — no workspace required
    files:
      "out/test/{extension,merry-parser,cli-detector,merry-codelens-provider}.test.js",
  },
  {
    // Integration tests — open test-workspace so the extension activates
    files: "out/test/integration.test.js",
    workspaceFolder: "./test-workspace",
  },
]);
