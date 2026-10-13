import { defineConfig } from "vitest/config";

/**
 * Monorepo test "projects" (Vitest 5 — replaced the separate
 * vitest.workspace.ts file from earlier Vitest versions). Each entry is a
 * directory containing its own vitest.config.ts; apps/api's needs a real
 * Postgres connection and a setup file, so it isn't shared config at the
 * root. packages/contracts has pure tests of its own. apps/web runs in jsdom, for the rich-text editor's pure behaviour.
 */
export default defineConfig({
  test: {
    projects: ["apps/api", "packages/contracts", "apps/web", "apps/mcp"],
  },
});
