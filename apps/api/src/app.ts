import express, { type Express } from "express";
import cookieParser from "cookie-parser";
import { env } from "./config/env.js";
import { AppError } from "./shared/errors.js";
import { applyProxyTrust } from "./lib/proxy.js";
import { applySecurityHeaders, DEFAULT_WEB_DIR, loadWebApp, serveWebApp } from "./web-app.js";
import { requestLogger } from "./middleware/request-logger.js";
import { errorHandler } from "./middleware/error-handler.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { projectsRouter } from "./modules/projects/projects.routes.js";
import { issuesRouter } from "./modules/issues/issues.routes.js";
import { labelsRouter } from "./modules/labels/labels.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { demoRouter } from "./modules/demo/demo.routes.js";
import { sprintsRouter } from "./modules/sprints/sprints.routes.js";
import { notificationsRouter } from "./modules/notifications/notifications.routes.js";
import { analyticsRouter } from "./modules/analytics/analytics.routes.js";
import { organizationsRouter } from "./modules/organizations/organizations.routes.js";
import { invitationsRouter } from "./modules/invitations/invitations.routes.js";
import { auditRouter } from "./modules/audit/audit.routes.js";
import { profilesRouter } from "./modules/profiles/profiles.routes.js";
import { myWorkRouter } from "./modules/my-work/my-work.routes.js";
import { apiTokensRouter } from "./modules/api-tokens/api-tokens.routes.js";
import { tokenRateLimiter } from "./middleware/rate-limit.js";

/**
 * Split from index.ts so tests can exercise the real middleware chain
 * (supertest drives requests straight at this app, in-process) without
 * opening an actual network port. index.ts is now just the thing that
 * calls .listen() — nothing here does.
 */
export const app: Express = express();

// Behind Render's proxy the visitor's address comes from X-Forwarded-For (ADR 0046); with nothing in front the header is ignored.
applyProxyTrust(app, env.TRUST_PROXY);

// In production the same process serves the built web app (ADR 0046). Read at start, so a missing build stops the server at boot.
const webApp = env.SERVE_WEB === "true" ? loadWebApp(env.WEB_DIST_DIR ?? DEFAULT_WEB_DIR) : undefined;
if (webApp) applySecurityHeaders(app, { html: webApp.html, appUrl: env.APP_URL });

app.use(requestLogger);
app.use(express.json());
app.use("/api/v1", tokenRateLimiter);
app.use(cookieParser());

// Health check is intentionally unversioned — it's infrastructure, not API
// surface. Everything else lives under /api/v1.
app.use("/api", healthRouter);
app.use("/api/v1", projectsRouter);
app.use("/api/v1", issuesRouter);
app.use("/api/v1", labelsRouter);
app.use("/api/v1", authRouter);
app.use("/api/v1", demoRouter);
app.use("/api/v1", sprintsRouter);
app.use("/api/v1", notificationsRouter);
app.use("/api/v1", analyticsRouter);
app.use("/api/v1", organizationsRouter);
app.use("/api/v1", invitationsRouter);
app.use("/api/v1", auditRouter);
app.use("/api/v1", profilesRouter);
app.use("/api/v1", myWorkRouter);
app.use("/api/v1", apiTokensRouter);

// An address under /api that no route answered is a JSON 404, never the web app's page (the page's fallback skips /api too).
app.use("/api", (_req, _res, next) => next(new AppError("not_found", 404, "No such API route.")));

if (webApp) serveWebApp(app, webApp);

// Must be registered after every route — see error-handler.ts.
app.use(errorHandler);
