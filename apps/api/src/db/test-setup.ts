import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";

// Runs once before this workspace's test files. Loads .env for
// TEST_DATABASE_URL, points DATABASE_URL at it (so every module that goes
// through config/env.ts — the repository under test included — talks to
// the test database, never dev), then applies migrations. migrate() is
// idempotent (drizzle tracks what's applied in __drizzle_migrations), so
// running it on every test run is safe and keeps the test schema current
// without a manual step.
try {
  process.loadEnvFile(fileURLToPath(new URL("../../.env", import.meta.url)));
} catch {
  // no .env file — fine if TEST_DATABASE_URL is already in the environment
}

if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL must be set to run integration tests — see apps/api/.env.example",
  );
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
// The tests load the owner's real .env, which may hold the live Cloudflare token for Ask FlowDesc (ADR 0077). A test must never reach the real service
// (it spends the free daily allowance), so the AI settings are dropped here: Ask is off unless a test sets a fake provider itself.
delete process.env.AI_DRIVER;
delete process.env.CLOUDFLARE_ACCOUNT_ID;
delete process.env.CLOUDFLARE_AI_TOKEN;
// The demo endpoint is on for the tests (they switch it off by changing `env.DEMO_ENABLED` where they need to).
process.env.DEMO_ENABLED = "true";
// Same reasoning: never let a test run write into the real dev uploads
// directory. lib/storage.ts reads UPLOADS_DIR through config/env.ts,
// which hasn't loaded yet at this point in the module graph.
process.env.UPLOADS_DIR = fileURLToPath(new URL("../../uploads-test", import.meta.url));

const { db, pool } = await import("./client.js");

await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });

// Vitest keeps the process alive between test files in a worker; close the
// pool when the whole run ends so it doesn't hang.
process.on("exit", () => {
  void pool.end();
});
