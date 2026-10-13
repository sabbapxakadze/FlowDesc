import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { app } from "../../app.js";
import { db } from "../../db/client.js";
import { apiTokens, organizations } from "../../db/schema/index.js";
import { resetDatabase } from "../../db/test-utils.js";
import { hashToken } from "../auth/tokens.js";

/**
 * Personal access tokens (ADR 0070), over real HTTP and the real database. Each test says what it protects.
 */

const PASSWORD = "password123";
type Session = { token: string; organizationId: string; userId: string };

async function registerAndLogIn(email: string, organizationName: string): Promise<Session> {
  await request(app)
    .post("/api/v1/auth/register")
    .send({ email, password: PASSWORD, name: "Owner Person", organizationName })
    .expect(201);
  const res = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD }).expect(200);
  return { token: res.body.accessToken, organizationId: res.body.organization.id, userId: res.body.user.id };
}
const as = (s: Session) => ({ Authorization: `Bearer ${s.token}` });
const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });
const org = (s: Session) => `/api/v1/organizations/${s.organizationId}`;

async function makeToken(s: Session, name = "Claude on my laptop", expiresInDays: 30 | 90 | 365 = 90) {
  const res = await request(app).post("/api/v1/users/me/api-tokens").set(as(s)).send({ name, scope: "read", expiresInDays }).expect(201);
  return { token: res.body.token as string, id: res.body.data.id as string, body: res.body };
}

async function makeProject(s: Session, key = "WEB") {
  const res = await request(app).post(`${org(s)}/projects`).set(as(s)).send({ name: "Website", key }).expect(201);
  return res.body.data.id as string;
}

beforeEach(resetDatabase);

describe("making and listing tokens", () => {
  it("returns the secret once, stores only its hash, and never shows either in the list", async () => {
    // Why: a database leak must not hand out working tokens, and the list must not become a second place the secret can be read.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const { token, id, body } = await makeToken(owner);

    expect(token).toMatch(/^fd_pat_[A-Za-z0-9_-]{43}$/);
    expect(body.data).toMatchObject({ name: "Claude on my laptop", scope: "read", revokedAt: null, lastUsedAt: null });

    const [row] = await db.select().from(apiTokens).where(eq(apiTokens.id, id));
    expect(row!.tokenHash).toBe(hashToken(token));
    expect(row!.tokenHash).not.toBe(token);

    const list = await request(app).get("/api/v1/users/me/api-tokens").set(as(owner)).expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain(token);
    expect(JSON.stringify(list.body)).not.toContain(row!.tokenHash);
    expect(list.body.data[0]).not.toHaveProperty("token");
    expect(list.body.data[0]).not.toHaveProperty("tokenHash");
  });

  it("refuses a bad request: no name, a scope that does not exist yet, an odd lifetime", async () => {
    // Why: only "read" may be created until write tools exist, so nobody holds a token whose scope promises more than the server does.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const post = (body: object) => request(app).post("/api/v1/users/me/api-tokens").set(as(owner)).send(body);
    await post({ name: "  ", scope: "read", expiresInDays: 90 }).expect(400);
    await post({ name: "x", scope: "read_write", expiresInDays: 90 }).expect(400);
    await post({ name: "x", scope: "read", expiresInDays: 9999 }).expect(400);
  });

  it("stops at 20 active tokens, and a revoked one frees a place", async () => {
    // Why: a cap keeps a forgotten script from filling the table, and revoking has to actually give the place back.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const first = await makeToken(owner, "t0");
    for (let i = 1; i < 20; i += 1) await makeToken(owner, `t${i}`);
    const refused = await request(app)
      .post("/api/v1/users/me/api-tokens")
      .set(as(owner))
      .send({ name: "one too many", scope: "read", expiresInDays: 30 })
      .expect(409);
    expect(refused.body.error.code).toBe("too_many_tokens");

    await request(app).delete(`/api/v1/users/me/api-tokens/${first.id}`).set(as(owner)).expect(204);
    await makeToken(owner, "fits now");
  });

  it("is not available in a demo copy", async () => {
    // Why: the demo is public and writes rows (ADR 0044); a token would hand a visitor a lasting credential.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    await db.update(organizations).set({ demoExpiresAt: new Date(Date.now() + 60 * 60 * 1000) }).where(eq(organizations.id, owner.organizationId));
    const res = await request(app)
      .post("/api/v1/users/me/api-tokens")
      .set(as(owner))
      .send({ name: "x", scope: "read", expiresInDays: 30 })
      .expect(403);
    expect(res.body.error.code).toBe("demo_restricted");
  });

  it("needs a signed-in session to list, and shows a person only their own tokens", async () => {
    // Why: tokens are private to their owner.
    const a = await registerAndLogIn("a@example.com", "Org A");
    const b = await registerAndLogIn("b@example.com", "Org B");
    await makeToken(a, "a's token");
    await request(app).get("/api/v1/users/me/api-tokens").expect(401);
    const list = await request(app).get("/api/v1/users/me/api-tokens").set(as(b)).expect(200);
    expect(list.body.data).toEqual([]);
  });
});

describe("revoking", () => {
  it("makes the token stop working on the next request, and is safe to repeat", async () => {
    // Why: revocation is the person's emergency brake, so it has to take effect immediately.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const { token, id } = await makeToken(owner);
    await request(app).get(`${org(owner)}/projects`).set(bearer(token)).expect(200);

    await request(app).delete(`/api/v1/users/me/api-tokens/${id}`).set(as(owner)).expect(204);
    await request(app).delete(`/api/v1/users/me/api-tokens/${id}`).set(as(owner)).expect(204);
    const after = await request(app).get(`${org(owner)}/projects`).set(bearer(token)).expect(401);
    expect(after.body.error.code).toBe("unauthenticated");

    const list = await request(app).get("/api/v1/users/me/api-tokens").set(as(owner)).expect(200);
    expect(list.body.data[0].revokedAt).not.toBeNull();
  });

  it("will not revoke somebody else's token", async () => {
    // Why: otherwise anyone who learns a token id could switch another person's client off.
    const a = await registerAndLogIn("a@example.com", "Org A");
    const b = await registerAndLogIn("b@example.com", "Org B");
    const { token, id } = await makeToken(a);
    await request(app).delete(`/api/v1/users/me/api-tokens/${id}`).set(as(b)).expect(404);
    await request(app).get(`${org(a)}/projects`).set(bearer(token)).expect(200);
    await request(app).delete("/api/v1/users/me/api-tokens/not-an-id").set(as(b)).expect(404);
  });
});

describe("using a token", () => {
  it("reads what its owner can read, and records when it was used", async () => {
    // Why: the whole point. The token acts as its owner, through the same membership checks.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const projectId = await makeProject(owner);
    const { token, id } = await makeToken(owner);

    const projects = await request(app).get(`${org(owner)}/projects`).set(bearer(token)).expect(200);
    expect(projects.body.data.map((p: { id: string }) => p.id)).toEqual([projectId]);
    await request(app).get(`${org(owner)}/projects/${projectId}/issues`).set(bearer(token)).expect(200);
    await request(app).get(`${org(owner)}/projects/${projectId}/board`).set(bearer(token)).expect(200);

    const [row] = await db.select().from(apiTokens).where(eq(apiTokens.id, id));
    expect(row!.lastUsedAt).not.toBeNull();
  });

  it("tells a client who it is and which organization to use", async () => {
    // Why: every address contains the organization id and a token holder has no login response to read it from.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const { token } = await makeToken(owner);
    const res = await request(app).get("/api/v1/users/me/context").set(bearer(token)).expect(200);
    expect(res.body.data.organization).toMatchObject({ id: owner.organizationId, name: "Org A", role: "owner" });
    expect(res.body.data.user).toMatchObject({ id: owner.userId, email: "owner@example.com" });
  });

  it("cannot reach another organization", async () => {
    // Why: a token is only its owner's reach. Membership is still checked after the token is accepted.
    const a = await registerAndLogIn("a@example.com", "Org A");
    const b = await registerAndLogIn("b@example.com", "Org B");
    await makeProject(b);
    const { token } = await makeToken(a);
    const res = await request(app).get(`${org(b)}/projects`).set(bearer(token)).expect(403);
    expect(res.body.error.code).toBe("not_a_member");
  });

  it("is refused once it has expired, and for a made-up value", async () => {
    // Why: an expiry date that is not checked is only decoration.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const { token, id } = await makeToken(owner);
    await db.update(apiTokens).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(apiTokens.id, id));
    await request(app).get(`${org(owner)}/projects`).set(bearer(token)).expect(401);
    await request(app).get(`${org(owner)}/projects`).set(bearer("fd_pat_" + "A".repeat(43))).expect(401);
    await request(app).get(`${org(owner)}/projects`).set(bearer("fd_pat_")).expect(401);
  });

  it("can only read: every write is refused, and the data is unchanged", async () => {
    // Why: this release is read-only (ADR 0070), whatever route is tried.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const projectId = await makeProject(owner);
    const { token } = await makeToken(owner);

    const created = await request(app)
      .post(`${org(owner)}/projects/${projectId}/issues`)
      .set(bearer(token))
      .send({ title: "From a token" })
      .expect(403);
    expect(created.body.error.code).toBe("token_not_allowed");
    await request(app).post(`${org(owner)}/projects`).set(bearer(token)).send({ name: "Other", key: "OTH" }).expect(403);
    await request(app).delete(`${org(owner)}/projects/${projectId}`).set(bearer(token)).expect(403);

    const issues = await request(app).get(`${org(owner)}/projects/${projectId}/issues`).set(as(owner)).expect(200);
    expect(issues.body.data).toEqual([]);
  });

  it("is kept away from accounts, tokens and the audit log", async () => {
    // Why: a leaked token must not be able to take over the account, mint longer-lived tokens, or read what is not on its list.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const { token, id } = await makeToken(owner);
    const call = (method: "get" | "post" | "delete" | "patch", path: string) => request(app)[method](path).set(bearer(token));

    await call("post", "/api/v1/auth/change-password").send({}).expect(403);
    // Logging out everywhere runs on the refresh cookie and never reads a Bearer header, so a token has nothing to present: 401.
    await call("post", "/api/v1/auth/logout-all").send({}).expect(401);
    await call("get", "/api/v1/users/me/account").expect(403);
    await call("get", "/api/v1/users/me/api-tokens").expect(403);
    await call("post", "/api/v1/users/me/api-tokens").send({ name: "sibling", scope: "read", expiresInDays: 365 }).expect(403);
    await call("delete", `/api/v1/users/me/api-tokens/${id}`).expect(403);
    await call("get", `${org(owner)}/audit-events`).expect(403);
    await call("get", `${org(owner)}/invitations`).expect(403);
    await call("get", `${org(owner)}/notifications`).expect(403);

    const list = await request(app).get("/api/v1/users/me/api-tokens").set(as(owner)).expect(200);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0].revokedAt).toBeNull();
  });

  it("still lets a normal signed-in session use every address", async () => {
    // Why: the allowlist applies to tokens only. A session must not be narrowed by it.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    await request(app).get("/api/v1/users/me/account").set(as(owner)).expect(200);
    await request(app).get(`${org(owner)}/audit-events`).set(as(owner)).expect(200);
  });
});
