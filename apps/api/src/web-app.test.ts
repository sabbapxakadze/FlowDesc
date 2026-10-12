import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import express from "express";
import request from "supertest";
import { errorHandler } from "./middleware/error-handler.js";
import { requestLogger } from "./middleware/request-logger.js";
import { AppError } from "./shared/errors.js";
import { applySecurityHeaders, inlineScriptHashes, loadWebApp, serveWebApp } from "./web-app.js";

/**
 * Serving the built web app from the API process (ADR 0046). The tests build a tiny app in the same order app.ts does (headers, an API route,
 * the JSON 404 for /api, the web app, the error handler) over a temporary folder that looks like `vite build` output.
 */

const THEME_SCRIPT = `try{document.documentElement.setAttribute("data-theme","dark")}catch(e){}`;
const INDEX_HTML = `<!doctype html><html><head><script>${THEME_SCRIPT}</script><script type="module" crossorigin src="/assets/index-abc123.js"></script></head><body><div id="root"></div></body></html>`;

let dir: string;
function buildApp(appUrl = "http://localhost:4200") {
  const web = loadWebApp(dir);
  const app = express();
  app.use(requestLogger); // the real error handler logs through it
  applySecurityHeaders(app, { html: web.html, appUrl });
  app.get("/api/ping", (_req, res) => res.json({ ok: true }));
  app.use("/api", (_req, _res, next) => next(new AppError("not_found", 404, "No such API route.")));
  serveWebApp(app, web);
  app.use(errorHandler);
  return app;
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "flowdesc-web-"));
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "index.html"), INDEX_HTML);
  writeFileSync(join(dir, "assets", "index-abc123.js"), "console.log('app')");
  writeFileSync(join(dir, "favicon.svg"), "<svg/>");
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("the web app is served by the API process", () => {
  it("answers the app's own addresses (the root and deep links) with the page, never cached", async () => {
    // Why: /projects/WEB/issues/WEB-12 is not a file; reloading or sharing such a link must still open the app, and a new deploy must be picked up at once.
    const app = buildApp();
    for (const path of ["/", "/login", "/projects/WEB/issues/WEB-12"]) {
      const res = await request(app).get(path).expect(200);
      expect(res.headers["content-type"]).toContain("text/html");
      expect(res.headers["cache-control"]).toBe("no-cache");
      expect(res.text).toContain('<div id="root">');
    }
  });

  it("caches hashed bundles for a year and other files for an hour", async () => {
    // Why: a bundle's name changes with its content, so it can be kept forever; anything else (a favicon, a screenshot) may change under the same name.
    const app = buildApp();
    const asset = await request(app).get("/assets/index-abc123.js").expect(200);
    expect(asset.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    const favicon = await request(app).get("/favicon.svg").expect(200);
    expect(favicon.headers["cache-control"]).toBe("public, max-age=3600");
  });

  it("a missing file is a real 404, not the page; an unknown API address is a JSON 404", async () => {
    // Why: a missing script that arrives as HTML fails in confusing ways in the browser; and the API's callers expect JSON errors, not a web page.
    const app = buildApp();
    const missing = await request(app).get("/assets/nope-999.js").expect(404);
    expect(missing.headers["content-type"]).not.toContain("html");
    const api = await request(app).get("/api/nothing-here").expect(404);
    expect(api.body.error.code).toBe("not_found");
    await request(app).get("/api/ping").expect(200); // real API routes are untouched
  });

  it("never answers /api or /socket.io with the page, and ignores non-GET requests", async () => {
    // Why: the page fallback must not swallow the API's own addresses or a POST to somewhere that does not exist.
    const app = buildApp();
    const sock = await request(app).get("/socket.io/?EIO=4&transport=polling");
    expect(sock.text).not.toContain('<div id="root">');
    const post = await request(app).post("/somewhere").send({});
    expect(post.text).not.toContain('<div id="root">');
  });
});

describe("security headers", () => {
  it("allows scripts only from this server plus the page's own inline script, by hash", async () => {
    // Why: a Content-Security-Policy that allows 'unsafe-inline' scripts would not stop injected scripts; the one inline script (the theme, applied before the first paint) is named exactly.
    const hash = `'sha256-${createHash("sha256").update(THEME_SCRIPT).digest("base64")}'`;
    const csp = (await request(buildApp()).get("/")).headers["content-security-policy"] as string;
    const scriptSrc = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("script-src "))!;
    expect(scriptSrc).toBe(`script-src 'self' ${hash}`);
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("connect-src 'self' ws://localhost:4200");
  });

  it("sets the usual protective headers and hides X-Powered-By", async () => {
    // Why: no content sniffing, no framing, no advertising the framework.
    const res = await request(buildApp()).get("/");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["strict-transport-security"]).toContain("max-age=");
  });

  it("upgrades insecure requests only for an https address, and names a wss WebSocket there", async () => {
    // Why: on a plain-http check (local, tests) 'upgrade-insecure-requests' would turn every request into https and break it; live it is wanted.
    const http = (await request(buildApp("http://localhost:4200")).get("/")).headers["content-security-policy"] as string;
    expect(http).not.toContain("upgrade-insecure-requests");
    const https = (await request(buildApp("https://flowdesk.onrender.com")).get("/")).headers["content-security-policy"] as string;
    expect(https).toContain("upgrade-insecure-requests");
    expect(https).toContain("connect-src 'self' wss://flowdesk.onrender.com");
  });
});

describe("helpers", () => {
  it("hashes inline scripts only: not ones with a src, not empty ones", () => {
    // Why: only the page's own inline code may be allowed by hash; the bundle is allowed as 'self'.
    const html = `<script>a()</script><script src="/x.js"></script><script type="module" crossorigin src="/y.js"></script><script>  </script><script>b()</script>`;
    const hashes = inlineScriptHashes(html);
    expect(hashes).toEqual([
      `'sha256-${createHash("sha256").update("a()").digest("base64")}'`,
      `'sha256-${createHash("sha256").update("b()").digest("base64")}'`,
    ]);
  });

  it("refuses to start when the build is missing, and says what to do", () => {
    // Why: a missing build is found when the server boots, not when the first visitor gets a blank page.
    expect(() => loadWebApp(join(tmpdir(), "flowdesk-no-such-build"))).toThrow(/Build the web app first/);
  });
});
