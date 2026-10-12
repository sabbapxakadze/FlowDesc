import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { runSmoke } from "./smoke-live.js";

/**
 * The live smoke check (ADR 0055) is only worth running if it can FAIL. These tests stand up a small fake of a healthy site, then break one thing
 * at a time and require the matching check to go red: a check that never fails would give false comfort every time the uptime workflow runs.
 */

type Tweaks = Partial<{ health: number; csp: boolean; xPoweredBy: boolean; envLeak: boolean; accountOpen: boolean }>;

let server: Server | undefined;
afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

async function fakeSite(tweaks: Tweaks = {}): Promise<string> {
  server = createServer((req, res) => {
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(body));
    };
    const url = req.url ?? "/";
    if (url === "/api/health") return json(tweaks.health ?? 200, { status: "ok" });
    if (url === "/api/v1/users/me/account") {
      return tweaks.accountOpen ? json(200, { data: { email: "someone@example.com" } }) : json(401, { error: { code: "unauthenticated" } });
    }
    if (url === "/api/v1/auth/oauth/providers") return json(200, { data: { providers: ["google"] } });
    if (url === "/api/v1/demo/info") return json(200, { data: { enabled: true, ttlMinutes: 120 } });
    if (url.startsWith("/api/")) return json(404, { error: { code: "not_found" } });
    const headers: Record<string, string> = { "Content-Type": "text/html; charset=utf-8", "X-Content-Type-Options": "nosniff" };
    if (tweaks.csp !== false) headers["Content-Security-Policy"] = "default-src 'self';object-src 'none'";
    if (tweaks.xPoweredBy) headers["X-Powered-By"] = "Express";
    res.writeHead(200, headers);
    res.end(url === "/.env" && tweaks.envLeak ? "DATABASE_URL=postgres://secret" : "<!doctype html><title>FlowDesc</title>");
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}

const failed = (results: Awaited<ReturnType<typeof runSmoke>>) => results.filter((r) => !r.ok).map((r) => r.name);

describe("smoke-live: a healthy site", () => {
  it("passes every check", async () => {
    // Why: the baseline. If this fails, every "breaks one thing" test below proves nothing.
    expect(failed(await runSmoke(await fakeSite()))).toEqual([]);
  });
});

describe("smoke-live: each problem turns its own check red", () => {
  it("a health check that does not say ok", async () => {
    // Why: this is the "is the site up" signal the uptime workflow exists for. With no wait it answers at once.
    expect(failed(await runSmoke(await fakeSite({ health: 500 })))).toEqual(["health answers 200 with status ok"]);
  });

  it("a missing Content-Security-Policy", async () => {
    expect(failed(await runSmoke(await fakeSite({ csp: false })))).toEqual(["a strict Content-Security-Policy is sent"]);
  });

  it("an announced framework (X-Powered-By)", async () => {
    expect(failed(await runSmoke(await fakeSite({ xPoweredBy: true })))).toEqual(["the framework is not announced (no X-Powered-By)"]);
  });

  it("a private endpoint that answers a visitor", async () => {
    // Why: the most serious failure the check can catch: data handed out without a login.
    expect(failed(await runSmoke(await fakeSite({ accountOpen: true })))).toEqual(["a private endpoint refuses a visitor (401)"]);
  });

  it("a .env file that is served", async () => {
    expect(failed(await runSmoke(await fakeSite({ envLeak: true })))).toEqual(["/.env is not served as a file"]);
  });

  it("a site that is not there at all stops after the first check, instead of throwing", async () => {
    // Why: the workflow must get a clear red result for a dead site, not a crash with a stack trace.
    const results = await runSmoke("http://127.0.0.1:1", { waitSeconds: 0 });
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ name: "health answers", ok: false });
  });
});
