import { createServer } from "node:http";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { pool } from "./db/client.js";
import { runMigrations } from "./db/run-migrations.js";
import { flushErrorReporting, initErrorReporting } from "./lib/error-reporting.js";
import { logger } from "./lib/logger.js";
import { createShutdown } from "./lib/shutdown.js";
import { attachSocketServer } from "./realtime/socket-server.js";

// Bring the schema up to date before taking any request (ADR 0046): Render's free plan has no pre-deploy step, so the server does it.
if (env.RUN_MIGRATIONS === "true") {
  await runMigrations();
  logger.info("database migrations are up to date");
}

// Error tracking is on only when SENTRY_DSN is set (ADR 0055); started before anything can fail.
await initErrorReporting();

// A real http.Server, not app.listen()'s implicit one — Socket.IO needs
// to attach to it directly (see realtime/socket-server.ts).
const httpServer = createServer(app);
const io = attachSocketServer(httpServer);

httpServer.listen(env.PORT, () => {
  logger.info(`flowdesc-api listening on http://localhost:${env.PORT}`);
});

// A clean stop on SIGTERM (a deploy, or Render letting the free service sleep) and Ctrl+C: stop taking requests, then close the database.
const shutdown = createShutdown({
  timeoutMs: 10_000,
  exit: (code) => process.exit(code),
  log: { info: (message) => logger.info(message), error: (details, message) => logger.error(details, message) },
  steps: [
    {
      // Closing Socket.IO also closes the http server; idle keep-alive connections would hold it open, so drop them.
      name: "http and socket servers",
      close: () => {
        const closed = new Promise<void>((resolve) => void io.close(() => resolve()));
        httpServer.closeIdleConnections();
        return closed;
      },
    },
    { name: "database pool", close: () => pool.end() },
    { name: "error reports", close: () => flushErrorReporting(2000) },
  ],
});
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => void shutdown(signal));
}
