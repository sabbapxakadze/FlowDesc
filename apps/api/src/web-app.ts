import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { extname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import express, { type Express } from "express";
import helmet from "helmet";

/**
 * Serving the built web app from the same process as the API (ADR 0046): one address for both, so the login's refresh cookie is
 * same-site and nothing needs CORS. Switched on with `SERVE_WEB=true` (Render's service sets it); development keeps using Vite.
 * `apps/web/build` is where `vite build` writes (kept apart from `dist`, where TypeScript puts its own output).
 */
export const DEFAULT_WEB_DIR = fileURLToPath(new URL("../../web/build", import.meta.url));

export interface WebApp {
  distDir: string;
  /** The page every address of the app answers with; read once at start. */
  html: string;
}

/** Reads the built page, and refuses to start without it: a missing build is a configuration mistake, found at boot, not on the first visit. */
export function loadWebApp(distDir: string): WebApp {
  const indexPath = join(distDir, "index.html");
  if (!existsSync(indexPath)) {
    throw new Error(
      `SERVE_WEB is on but ${indexPath} does not exist. Build the web app first (pnpm build), or set WEB_DIST_DIR to where it was built.`,
    );
  }
  return { distDir, html: readFileSync(indexPath, "utf8") };
}

/**
 * The Content-Security-Policy allows scripts only from this server plus the page's own inline scripts, named by hash (the small script in
 * index.html that applies the saved theme before the first paint). Everything else inline stays blocked.
 */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  for (const match of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    // The browser hashes the script as its HTML parser sees it, and the parser turns CRLF into LF, so the hash must be of the LF text
    // (a file saved with Windows line endings would otherwise be blocked by its own policy).
    const body = match[1]?.replace(/\r\n?/g, "\n");
    if (body && body.trim() !== "") hashes.push(`'sha256-${createHash("sha256").update(body).digest("base64")}'`);
  }
  return hashes;
}

/**
 * Security headers on every response (helmet): no sniffing, no framing, HTTPS-only for a year (browsers ignore it over plain http), no
 * X-Powered-By, and the CSP above. `connect-src` names the WebSocket address because older browsers do not treat 'self' as covering it.
 * `upgrade-insecure-requests` is added only for an https address: on a plain-http check (local, tests) it would turn every request into https.
 */
export function applySecurityHeaders(app: Express, options: { html: string; appUrl: string }): void {
  const url = new URL(options.appUrl);
  const webSocketOrigin = `${url.protocol === "https:" ? "wss" : "ws"}://${url.host}`;
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", ...inlineScriptHashes(options.html)],
          scriptSrcAttr: ["'none'"],
          // React sets style="..." on elements (positions, sizes, the drag overlay), which needs 'unsafe-inline' for styles only.
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "blob:"],
          mediaSrc: ["'self'", "blob:"],
          fontSrc: ["'self'", "data:"],
          connectSrc: ["'self'", webSocketOrigin],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
          ...(url.protocol === "https:" ? { upgradeInsecureRequests: [] } : {}),
        },
      },
    }),
  );
}

/**
 * Registered AFTER every API route. Static files first (hashed bundles under /assets are cached for a year because their names change
 * with their content; everything else for an hour), then the app's own addresses (/projects/WEB, /login, ...) all answer with index.html
 * and never cached, so a new deploy is picked up at once. A path with a file extension that matched no file is a real 404, never the page
 * (a missing script must fail loudly, not arrive as HTML). /api and /socket.io are never answered here.
 */
export function serveWebApp(app: Express, web: WebApp): void {
  app.use(
    express.static(web.distDir, {
      index: false,
      redirect: false,
      setHeaders(res, filePath) {
        const hashed = filePath.includes(`${sep}assets${sep}`);
        res.setHeader("Cache-Control", hashed ? "public, max-age=31536000, immutable" : "public, max-age=3600");
      },
    }),
  );

  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (/^\/(api|socket\.io)(\/|$)/.test(req.path)) return next();
    if (extname(req.path) !== "") {
      res.status(404).type("text/plain").send("Not found");
      return;
    }
    res.setHeader("Cache-Control", "no-cache");
    res.type("html").send(web.html);
  });
}
