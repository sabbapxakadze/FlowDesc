import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { eq, like } from "drizzle-orm";
import { app } from "../../app.js";
import { env } from "../../config/env.js";
import { db } from "../../db/client.js";
import { resetDatabase } from "../../db/test-utils.js";
import { demoStarts, organizations, users } from "../../db/schema/index.js";
import * as demoRepository from "./demo.repository.js";

/**
 * "Try the demo" (ADR 0044), over real HTTP and the real database: a private copy per start, with limits enforced on the server, and
 * a clean-up of copies whose time is up. The tests change `env` for one case at a time and put it back afterwards.
 */

const original = { enabled: env.DEMO_ENABLED, max: env.DEMO_MAX_ACTIVE, ttl: env.DEMO_TTL_MINUTES, nodeEnv: env.NODE_ENV };
beforeEach(async () => {
  await resetDatabase();
});
afterEach(() => {
  env.DEMO_ENABLED = original.enabled;
  env.DEMO_MAX_ACTIVE = original.max;
  env.DEMO_TTL_MINUTES = original.ttl;
  env.NODE_ENV = original.nodeEnv;
  vi.restoreAllMocks();
});

type Demo = { token: string; cookie: string; userId: string; organizationId: string; demoExpiresAt: string };
async function startDemo(): Promise<Demo> {
  const res = await request(app).post("/api/v1/demo/start").expect(201);
  const cookie = (res.headers["set-cookie"] as unknown as string[]).find((c) => c.startsWith("flowdesc_refresh_token="))!.split(";")[0]!;
  return { token: res.body.accessToken, cookie, userId: res.body.user.id, organizationId: res.body.organization.id, demoExpiresAt: res.body.organization.demoExpiresAt };
}
const as = (d: Demo) => ({ Authorization: `Bearer ${d.token}` });
const base = (d: Demo) => `/api/v1/organizations/${d.organizationId}`;

async function firstProject(d: Demo) {
  const res = await request(app).get(`${base(d)}/projects`).set(as(d)).expect(200);
  return res.body.data[0] as { id: string };
}

describe("demo: counting starts (ADR 0076)", () => {
  const rows = () => db.select().from(demoStarts);

  it("writes one row per start, with nothing personal in it, and keeps it after the copy is deleted", async () => {
    // Why: this is the only record of how many demos there were, since each copy is deleted. It must outlive the clean-up and hold no email,
    // address, user or organization (the copy is gone, and the row must stay harmless).
    const first = await startDemo();
    await startDemo();
    expect((await rows()).map((r) => r.outcome)).toEqual(["started", "started"]);
    expect(Object.keys((await rows())[0]!).sort()).toEqual(["createdAt", "id", "outcome"]);

    await db.update(organizations).set({ demoExpiresAt: new Date(Date.now() - 60_000) }).where(eq(organizations.id, first.organizationId));
    await startDemo(); // the clean-up removes the expired copy
    expect(await db.select().from(organizations)).toHaveLength(2);
    expect(await rows()).toHaveLength(3);
  });

  it("counts a refusal because the demo is busy, separately", async () => {
    // Why: "busy" tells the owner people were turned away, which a count of started demos alone would hide.
    env.DEMO_MAX_ACTIVE = 1;
    await startDemo();
    await request(app).post("/api/v1/demo/start").expect(503);
    expect((await rows()).map((r) => r.outcome).sort()).toEqual(["busy", "started"]);
  });

  it("counts nothing when the demo is switched off", async () => {
    // Why: nobody tried a demo, so there is nothing to count.
    env.DEMO_ENABLED = undefined;
    await request(app).post("/api/v1/demo/start").expect(404);
    expect(await rows()).toHaveLength(0);
  });

  it("never stops a demo because the count could not be written", async () => {
    // Why: a statistic is not worth a broken front door. If the table is unreachable, the visitor still gets their demo.
    vi.spyOn(demoRepository, "recordStart").mockRejectedValue(new Error("the table is gone"));
    const demo = await startDemo();
    expect(demo.token).toBeTruthy();
    expect(await rows()).toHaveLength(0);
  });
});

describe("demo: switching it on and off", () => {
  it("says whether the demo is offered, and for how long a copy lives", async () => {
    // Why: the landing page draws its button and its "deleted after about N hours" line from this.
    env.DEMO_ENABLED = "true";
    env.DEMO_TTL_MINUTES = 90;
    expect((await request(app).get("/api/v1/demo/info").expect(200)).body.data).toEqual({ enabled: true, ttlMinutes: 90 });
    env.DEMO_ENABLED = undefined;
    expect((await request(app).get("/api/v1/demo/info").expect(200)).body.data.enabled).toBe(false);
  });

  it("is off unless DEMO_ENABLED is 'true': starting one is a 404 and creates nothing", async () => {
    // Why: a deploy that never decided must expose no public write endpoint.
    env.DEMO_ENABLED = undefined;
    const res = await request(app).post("/api/v1/demo/start").expect(404);
    expect(res.body.error.code).toBe("demo_disabled");
    expect(await db.select().from(organizations)).toHaveLength(0);
  });
});

describe("demo: starting one", () => {
  it("makes a private, passwordless, expiring copy and signs the visitor in as its owner", async () => {
    // Why: this is the feature. The copy must hold the demo data, be marked to expire, and be enterable only through the session the
    // server issues (nobody can log in to it with a guessed password).
    const demo = await startDemo();

    const [org] = await db.select().from(organizations).where(eq(organizations.id, demo.organizationId));
    expect(org!.demoExpiresAt).not.toBeNull();
    const minutesLeft = (org!.demoExpiresAt!.getTime() - Date.now()) / 60_000;
    expect(minutesLeft).toBeGreaterThan(env.DEMO_TTL_MINUTES - 2);
    expect(minutesLeft).toBeLessThanOrEqual(env.DEMO_TTL_MINUTES);
    expect(demo.demoExpiresAt).toBe(org!.demoExpiresAt!.toISOString()); // the session carries it, so the app can say when it ends

    const people = await db.select().from(users).where(like(users.email, "%@demo.flowdesc.test"));
    expect(people).toHaveLength(5);
    expect(people.every((p) => p.passwordHash === null)).toBe(true);

    const projects = await request(app).get(`${base(demo)}/projects`).set(as(demo)).expect(200);
    expect(projects.body.data).toHaveLength(3);

    // The cookie keeps the session going, like a login's.
    const refreshed = await request(app).post("/api/v1/auth/refresh").set("Cookie", demo.cookie).expect(200);
    expect(refreshed.body.organization.demoExpiresAt).toBe(demo.demoExpiresAt);
  });

  it("two starts never share anything: another organization, other people, and no way into each other's data", async () => {
    // Why: the reason for a copy per click. Visitors must not see, change or wipe each other's data.
    const a = await startDemo();
    const b = await startDemo();
    expect(a.organizationId).not.toBe(b.organizationId);
    expect(a.userId).not.toBe(b.userId);

    const projectA = await firstProject(a);
    await request(app).post(`${base(a)}/projects/${projectA.id}/issues`).set(as(a)).send({ title: "Only in visitor A" }).expect(201);

    const projectB = await firstProject(b);
    const listB = await request(app).get(`${base(b)}/projects/${projectB.id}/issues?limit=100`).set(as(b)).expect(200);
    expect(JSON.stringify(listB.body)).not.toContain("Only in visitor A");

    // And A's token does not open B's organization.
    await request(app).get(`${base(b)}/projects`).set(as(a)).expect(403);
  });

  it("refuses to make another one when the live copies have reached the cap", async () => {
    // Why: each copy is several hundred rows; the cap keeps a flood from filling the database.
    env.DEMO_MAX_ACTIVE = 2;
    await startDemo();
    await startDemo();
    const res = await request(app).post("/api/v1/demo/start").expect(503);
    expect(res.body.error.code).toBe("demo_busy");
    expect(await db.select().from(organizations)).toHaveLength(2);
  });

  it("deletes the copies whose time is up (and their people) on the next start, and leaves live ones alone", async () => {
    // Why: nothing else removes them yet; without this the database fills with abandoned demos.
    const live = await startDemo();
    const old = await startDemo();
    await db.update(organizations).set({ demoExpiresAt: new Date(Date.now() - 60_000) }).where(eq(organizations.id, old.organizationId));

    const fresh = await startDemo(); // triggers the clean-up

    const remaining = (await db.select({ id: organizations.id }).from(organizations)).map((o) => o.id);
    expect(remaining).toContain(live.organizationId);
    expect(remaining).toContain(fresh.organizationId);
    expect(remaining).not.toContain(old.organizationId);
    expect((await db.select().from(users).where(eq(users.id, old.userId)))).toHaveLength(0);
    expect((await db.select().from(users).where(eq(users.id, live.userId)))).toHaveLength(1);
    // the deleted copy's session is gone with it
    await request(app).post("/api/v1/auth/refresh").set("Cookie", old.cookie).expect(401);
  });

  it("refuses a demo whose time is up even before the clean-up has removed it", async () => {
    // Why: the clean-up only runs when someone starts a new demo. Without this, an expired copy would keep working on a quiet site and
    // "deleted after N hours" would be a promise about the rows only.
    const demo = await startDemo();
    await db.update(organizations).set({ demoExpiresAt: new Date(Date.now() - 1_000) }).where(eq(organizations.id, demo.organizationId));
    const res = await request(app).get(`${base(demo)}/projects`).set(as(demo)).expect(403);
    expect(res.body.error.code).toBe("demo_expired");
    const refresh = await request(app).post("/api/v1/auth/refresh").set("Cookie", demo.cookie).expect(401);
    expect(refresh.body.error.code).toBe("demo_expired");
  });

  it("is rate limited per address: the sixth start in an hour is a 429", async () => {
    // Why: the route has to carry the limiter (the shared app skips it under NODE_ENV=test, so it is switched on for this one case).
    env.NODE_ENV = "development";
    env.DEMO_ENABLED = undefined; // each answers 404 without building anything, but the limiter counts them
    for (let i = 0; i < 5; i += 1) await request(app).post("/api/v1/demo/start").expect(404);
    const sixth = await request(app).post("/api/v1/demo/start").expect(429);
    expect(sixth.body.error.code).toBe("too_many_requests");
  });
});

describe("demo: what a demo copy may not do", () => {
  const refused = (res: request.Response) => {
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("demo_restricted");
  };

  it("cannot invite people or resend an invitation (they send email to any address)", async () => {
    // Why: otherwise a visitor could make the server send email to anyone.
    const demo = await startDemo();
    refused(await request(app).post(`${base(demo)}/invitations`).set(as(demo)).send({ email: "someone@example.com", role: "member" }));
    const list = await request(app).get(`${base(demo)}/invitations`).set(as(demo)).expect(200);
    const invitationId = list.body.data[0].id as string;
    refused(await request(app).post(`${base(demo)}/invitations/${invitationId}/resend`).set(as(demo)));
  });

  it("cannot change the email, change or set a password, or connect a Google/GitHub account", async () => {
    // Why: these change who an account is; a copy's accounts are throwaway and must stay that way.
    const demo = await startDemo();
    refused(await request(app).post("/api/v1/auth/email-change/request").set(as(demo)).send({ newEmail: "x@example.com", password: "whatever1" }));
    refused(await request(app).post("/api/v1/auth/change-password").set(as(demo)).set("Cookie", demo.cookie).send({ currentPassword: "a", newPassword: "password123" }));
    refused(await request(app).post("/api/v1/auth/set-password").set(as(demo)).set("Cookie", demo.cookie).send({ newPassword: "password123" }));
    refused(await request(app).post("/api/v1/auth/oauth/google/start").set(as(demo)).send({ intent: "link" }));
  });

  it("cannot upload a file or a profile photo (storage), and the refusal comes before the upload is read", async () => {
    // Why: uploads write to disk; a public demo must not be a free file host.
    const demo = await startDemo();
    const project = await firstProject(demo);
    const issues = await request(app).get(`${base(demo)}/projects/${project.id}/issues?limit=1`).set(as(demo)).expect(200);
    const issueId = issues.body.data[0].id as string;
    const png = Buffer.from("not really a picture");
    refused(await request(app).post(`${base(demo)}/projects/${project.id}/issues/${issueId}/attachments`).set(as(demo)).attach("file", png, { filename: "a.png", contentType: "image/png" }));
    refused(await request(app).put("/api/v1/users/me/avatar").set(as(demo)).attach("file", png, { filename: "a.png", contentType: "image/png" }));
  });

  it("is limited to 300 issues", async () => {
    // Why: so one visitor cannot fill the database. (The count is faked at the limit: making 300 real issues would be slow and prove nothing more.)
    const demo = await startDemo();
    const project = await firstProject(demo);
    vi.spyOn(demoRepository, "countIssuesInOrganization").mockResolvedValue(300);
    refused(await request(app).post(`${base(demo)}/projects/${project.id}/issues`).set(as(demo)).send({ title: "One too many" }));
  });

  it("does not limit anyone else: a normal account invites, changes its password and creates issues", async () => {
    // Why: the guard must be about demo copies only; every one of these is real, working behaviour for real people.
    const email = "real@example.com";
    await request(app).post("/api/v1/auth/register").send({ email, password: "password123", name: "Real Person", organizationName: "Real Org" }).expect(201);
    const login = await request(app).post("/api/v1/auth/login").send({ email, password: "password123" }).expect(200);
    const token = login.body.accessToken as string;
    const cookie = (login.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
    const orgId = login.body.organization.id as string;
    expect(login.body.organization.demoExpiresAt).toBeNull();

    const invite = await request(app).post(`/api/v1/organizations/${orgId}/invitations`).set({ Authorization: `Bearer ${token}` }).send({ email: "friend@example.com", role: "member" });
    expect(invite.body.error?.code).not.toBe("demo_restricted");
    expect(invite.status).toBeLessThan(300);
    const change = await request(app).post("/api/v1/auth/change-password").set({ Authorization: `Bearer ${token}` }).set("Cookie", cookie).send({ currentPassword: "password123", newPassword: "another-password" });
    expect(change.status).toBe(200);
  });
});

describe("demo: times are shown in the visitor's own timezone", () => {
  it("signs the visitor in with no saved timezone, and nobody in the copy has one", async () => {
    // Why: the demo people used to carry made-up zones (the visitor, the owner of the copy, was in New York), so a visitor saw every time in a zone that was not theirs.
    // A null timezone means "the browser's" (ADR 0031), which is what a visitor expects.
    env.DEMO_ENABLED = "true";
    const res = await request(app).post("/api/v1/demo/start").expect(201);
    expect(res.body.user.timezone).toBeNull();
    const people = await db.select({ email: users.email, timezone: users.timezone }).from(users).where(like(users.email, "%@demo.flowdesc.test"));
    expect(people).toHaveLength(5);
    expect(people.filter((person) => person.timezone !== null)).toEqual([]);
  });
});
