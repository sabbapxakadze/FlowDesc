import { describe, expect, it } from "vitest";
import express from "express";
import rateLimit from "express-rate-limit";
import request from "supertest";
import { tokenMayCall } from "./token-access.js";

const ORG = "/api/v1/organizations/11111111-1111-1111-1111-111111111111";
const PROJECT = `${ORG}/projects/22222222-2222-2222-2222-222222222222`;

describe("which addresses a token may call (ADR 0070)", () => {
  it("allows the read addresses, with or without a query string or a trailing slash", () => {
    // Why: these are what the MCP tools need; a typo in the list would silently lock a tool out.
    for (const path of [
      "/api/v1/users/me/context",
      `${ORG}/members`,
      `${ORG}/labels`,
      `${ORG}/search?q=login`,
      `${ORG}/projects`,
      `${ORG}/projects/summary`,
      `${PROJECT}/issues?status=todo&limit=20`,
      `${PROJECT}/issues/by-number/12`,
      `${PROJECT}/issues/33333333-3333-3333-3333-333333333333`,
      `${PROJECT}/issues/33333333-3333-3333-3333-333333333333/events`,
      `${PROJECT}/board`,
      `${PROJECT}/backlog`,
      `${PROJECT}/sprints/`,
      `${PROJECT}/analytics/velocity?sprints=6`,
      `${ORG}/my-work/week`,
    ]) {
      expect(tokenMayCall("GET", path), path).toBe(true);
    }
  });

  it("refuses every method but GET, even on an allowed address", () => {
    // Why: this release is read-only. This is the line that keeps it so.
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(tokenMayCall(method, `${PROJECT}/issues`), method).toBe(false);
    }
  });

  it("refuses addresses that are not on the list, and ones that only look like a listed one", () => {
    // Why: default-deny. Anything new, sensitive, or sneaking a listed path into another one stays closed.
    for (const path of [
      "/api/v1/auth/refresh",
      "/api/v1/users/me/account",
      "/api/v1/users/me/api-tokens",
      `${ORG}/audit-events`,
      `${ORG}/audit-events/export`,
      `${ORG}/invitations`,
      `${ORG}/notifications`,
      `${PROJECT}/issues/33333333-3333-3333-3333-333333333333/attachments`,
      `${ORG}/projects/extra/path/issues`,
      `/evil${ORG}/projects`,
      `${ORG}/projects/../audit-events`,
      `${ORG}/members/44444444-4444-4444-4444-444444444444/profile`,
    ]) {
      expect(tokenMayCall("GET", path), path).toBe(false);
    }
  });
});

describe("the per-token rate limit mechanism", () => {
  it("counts each token separately, and a token over its limit gets a 429 while another does not", async () => {
    // Why: the real limiter is skipped under test (like the others), so this proves the keying idea in an isolated app: one runaway
    // client must not use up another person's allowance.
    const app = express();
    const limiter = rateLimit({
      windowMs: 60_000,
      limit: 2,
      keyGenerator: (req) => req.headers.authorization ?? "",
      handler: (_req, res) => {
        res.status(429).json({ error: { code: "too_many_requests" } });
      },
    });
    app.get("/x", limiter, (_req, res) => res.json({ ok: true }));

    const as = (token: string) => request(app).get("/x").set("Authorization", `Bearer ${token}`);
    await as("fd_pat_one").expect(200);
    await as("fd_pat_one").expect(200);
    await as("fd_pat_one").expect(429);
    await as("fd_pat_two").expect(200);
  });
});
