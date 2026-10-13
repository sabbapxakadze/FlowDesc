import { defineConfig } from "vitest/config";

// Pure tests: a fake FlowDesc server on a local port, no database. The test against the real API lives in apps/api.
export default defineConfig({
  test: {
    name: "mcp",
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
