import { defineConfig, devices } from "@playwright/test";
import { fileURLToPath } from "node:url";

/**
 * End-to-end tests (ADR 0020). Everything here runs against its OWN api (port
 * 4100) and web server (port 5273), pointed at the flowdesk_test database and
 * a separate uploads folder, so a run can never touch dev data or collide with
 * `pnpm dev` on 4000 / 5173.
 *
 * TEST_DATABASE_URL comes from apps/api/.env, the same place the API's own
 * test setup reads it.
 */
try {
  process.loadEnvFile(fileURLToPath(new URL("../apps/api/.env", import.meta.url)));
} catch {
  // no .env file: fine if the variables are already in the environment
}

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL must be set to run e2e tests (see apps/api/.env.example)",
  );
}

const API_PORT = 4100;
const WEB_PORT = 5273;

export default defineConfig({
  testDir: "./tests",
  // One shared database that is reset before every test: tests cannot run in
  // parallel without racing each other, same reasoning as the API's vitest config.
  workers: 1,
  fullyParallel: false,
  // On CI (the CI variable is set by GitHub) a failed test is tried once more. If the second try passes, the report marks it "flaky" instead
  // of green: it is a hint to find the hidden timing assumption, not a pass to ignore (ADR 0047). Locally nothing is retried.
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never", outputFolder: "../playwright-report" }]],
  outputDir: "../test-results",
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // The app animates (page changes, the side panel, rows, dialogs). Ordinary tests run with the system
    // setting "reduce motion", which turns every animation off and removes every exit delay, so they do not
    // wait for or race animations. e2e/tests/motion.spec.ts opts back in to test the animations themselves.
    reducedMotion: "reduce",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      name: "api",
      command: "pnpm exec tsx --env-file-if-exists=.env src/index.ts",
      cwd: "../apps/api",
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        // "test" skips the rate limiters (register allows 5 per hour per process,
        // which a suite exceeds quickly), the same switch the API tests rely on.
        // Side effect: the refresh cookie is set with the Secure flag, as in
        // production; Chromium accepts that on http://localhost, and the reload
        // test proves the session still survives it.
        NODE_ENV: "test",
        // "Try the demo" is on for the e2e API (it is off by default, ADR 0044).
        DEMO_ENABLED: "true",
        LOG_LEVEL: "warn",
        PORT: String(API_PORT),
        DATABASE_URL: testDatabaseUrl,
        UPLOADS_DIR: "./uploads-e2e",
        APP_URL: `http://localhost:${WEB_PORT}`,
        // A dummy key: registration still calls Resend, which rejects it, and
        // the API only logs that. Nothing is ever delivered from a test.
        RESEND_API_KEY: "e2e-dummy-key",
        // Nothing is sent: a message is only logged and counts as sent, so "Report a bug" (ADR 0075), which must tell the person when a send fails,
        // can be tried end to end. That also means no browser test proves a real email arrives; that is checked by hand on the live site.
        EMAIL_DRIVER: "log",
      },
    },
    {
      name: "web",
      command: `pnpm exec vite --port ${WEB_PORT} --strictPort`,
      cwd: "../apps/web",
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: { API_PROXY_TARGET: `http://localhost:${API_PORT}` },
    },
  ],
});
