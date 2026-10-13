import { createServer as createHttpServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { sql } from "drizzle-orm";
import { connectTestClient } from "flowdesc-mcp/testing";
import { app } from "../../app.js";
import { db } from "../../db/client.js";
import { resetDatabase } from "../../db/test-utils.js";

/**
 * The MCP server (apps/mcp) talking to the REAL API on a real port with a real token and the real database. The tests inside apps/mcp
 * use a pretend API; this is the test that stops that pretend from drifting away from what FlowDesc really answers (ADR 0070).
 */

const PASSWORD = "password123";
type Session = { token: string; organizationId: string };

let httpServer: Server;
let baseUrl: string;
beforeAll(async () => {
  httpServer = createHttpServer(app);
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(httpServer.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});
beforeEach(resetDatabase);

async function registerAndLogIn(email: string, organizationName: string): Promise<Session> {
  await request(app).post("/api/v1/auth/register").send({ email, password: PASSWORD, name: "Owner Person", organizationName }).expect(201);
  const res = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD }).expect(200);
  return { token: res.body.accessToken, organizationId: res.body.organization.id };
}
const as = (s: Session) => ({ Authorization: `Bearer ${s.token}` });

async function makeToken(s: Session) {
  const res = await request(app).post("/api/v1/users/me/api-tokens").set(as(s)).send({ name: "mcp", scope: "read", expiresInDays: 30 }).expect(201);
  return { secret: res.body.token as string, id: res.body.data.id as string };
}

/** A project with two issues (one commented and labelled), a label and a sprint: enough for every tool to return something real. */
async function seed(s: Session, key: string, title: string) {
  const org = `/api/v1/organizations/${s.organizationId}`;
  const project = await request(app).post(`${org}/projects`).set(as(s)).send({ name: `${key} project`, key }).expect(201);
  const projectId = project.body.data.id as string;
  const issue = await request(app).post(`${org}/projects/${projectId}/issues`).set(as(s)).send({ title }).expect(201);
  await request(app).post(`${org}/projects/${projectId}/issues`).set(as(s)).send({ title: `${title} second` }).expect(201);
  const issueId = issue.body.data.id as string;
  const label = await request(app).post(`${org}/labels`).set(as(s)).send({ name: `Bug ${key}`, color: "#FF5733" }).expect(201);
  await request(app).post(`${org}/projects/${projectId}/issues/${issueId}/labels`).set(as(s)).send({ labelId: label.body.data.id }).expect(201);
  await request(app).post(`${org}/projects/${projectId}/issues/${issueId}/comments`).set(as(s)).send({ body: "A real comment" }).expect(201);
  await request(app).post(`${org}/projects/${projectId}/sprints`).set(as(s)).send({ name: "Sprint 1" }).expect(201);
  return { projectId, issueId };
}

async function connect(token: string) {
  const client = await connectTestClient({ baseUrl, token });
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const out = await client.call(name, args);
    return { ...out, json: () => out.json() as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any -- reading arbitrary tool output in a test
  };
  return { client, call };
}

const ALL_CALLS: [string, Record<string, unknown>][] = [
  ["whoami", {}],
  ["list_projects", {}],
  ["list_issues", { project: "WEB" }],
  ["get_issue", { issue: "WEB-1" }],
  ["search_issues", { query: "Footer" }],
  ["get_sprints", { project: "WEB" }],
  ["get_backlog", { project: "WEB" }],
  ["get_analytics", { project: "WEB", metric: "throughput" }],
  ["get_analytics", { project: "WEB", metric: "cycle-time" }],
  ["get_analytics", { project: "WEB", metric: "velocity" }],
  ["get_analytics", { project: "WEB", metric: "breakdown" }],
  ["get_my_work", { view: "assigned" }],
  ["get_my_work", { view: "week" }],
];

describe("every tool against the real API", () => {
  it("returns real data for a real project, through a real token", async () => {
    // Why: proves each tool's address, query names and the response shapes it relies on match what the API really sends today.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    await seed(owner, "WEB", "Footer links open the wrong page");
    const { secret } = await makeToken(owner);
    const { client, call } = await connect(secret);

    for (const [name, args] of ALL_CALLS) {
      const out = await call(name, args);
      expect(out.isError, `${name} ${JSON.stringify(args)}: ${out.text}`).toBe(false);
    }

    expect((await call("whoami")).json()).toMatchObject({ user: { email: "owner@example.com" }, organization: { name: "Org A", role: "owner" } });
    const projects = (await call("list_projects")).json().data as { key: string; total: number }[];
    expect(projects).toMatchObject([{ key: "WEB", total: 2 }]);
    const issues = (await call("list_issues", { project: "web", labels: ["bug web"] })).json().data as { title: string }[];
    expect(issues.map((i) => i.title)).toEqual(["Footer links open the wrong page"]); // the label filter really filtered
    const issue = (await call("get_issue", { issue: "WEB-1" })).json();
    expect(issue.issue.title).toBe("Footer links open the wrong page");
    expect(issue.labels).toHaveLength(1);
    expect(JSON.stringify(issue.history)).toContain("A real comment");
    expect((await call("search_issues", { query: "Footer" })).json().total).toBe(2); // the seeded issue and its "second" twin both match
    expect((await call("get_sprints", { project: "WEB" })).json().data).toMatchObject([{ name: "Sprint 1" }]);
    await client.close();
  });

  it("cannot see another organization's project, its issues, or search hits from it", async () => {
    // Why: a token is only its owner's reach. This proves the tools cannot be pointed at someone else's data by key or by search.
    const a = await registerAndLogIn("a@example.com", "Org A");
    const b = await registerAndLogIn("b@example.com", "Org B");
    await seed(a, "WEB", "Public roadmap item");
    await seed(b, "SEC", "Secret acquisition plan");
    const { call } = await connect((await makeToken(a)).secret);

    const wrongKey = await call("list_issues", { project: "SEC" });
    expect(wrongKey.isError).toBe(true);
    expect(wrongKey.text).toContain("WEB");
    expect(wrongKey.text).not.toContain("SEC (");
    expect((await call("search_issues", { query: "acquisition" })).json().total).toBe(0);
    expect(JSON.stringify((await call("list_projects")).json())).not.toContain("SEC");
  });

  it("stops working the moment the token is revoked, and says why", async () => {
    // Why: revoking is the emergency brake, so it has to reach tools that are already connected.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    await seed(owner, "WEB", "Anything");
    const { secret, id } = await makeToken(owner);
    const { call } = await connect(secret);
    expect((await call("whoami")).isError).toBe(false);

    await request(app).delete(`/api/v1/users/me/api-tokens/${id}`).set(as(owner)).expect(204);
    for (const [name, args] of [["list_projects", {}], ["search_issues", { query: "Anything" }], ["get_my_work", { view: "assigned" }]] as const) {
      const out = await call(name, args);
      expect(out.isError, name).toBe(true);
      expect(out.text, name).toContain("revoked or expired");
      expect(out.text, name).not.toContain(secret);
    }
  });

  it("cannot change anything: no row in any data table changes after calling every tool", async () => {
    // Why: the whole promise of this release is read-only. Counting rows before and after, in every table that holds user data, proves it.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    await seed(owner, "WEB", "Footer links");
    const { secret } = await makeToken(owner);
    const counts = async () =>
      (
        await db.execute<{ t: string; n: number }>(sql`
          SELECT 'projects' t, count(*)::int n FROM projects UNION ALL SELECT 'issues', count(*)::int FROM issues
          UNION ALL SELECT 'issue_events', count(*)::int FROM issue_events UNION ALL SELECT 'comments', count(*)::int FROM comments
          UNION ALL SELECT 'labels', count(*)::int FROM labels UNION ALL SELECT 'sprints', count(*)::int FROM sprints
          UNION ALL SELECT 'notifications', count(*)::int FROM notifications UNION ALL SELECT 'audit_events', count(*)::int FROM audit_events
          UNION ALL SELECT 'members', count(*)::int FROM organization_members UNION ALL SELECT 'users', count(*)::int FROM users
          UNION ALL SELECT 'api_tokens', count(*)::int FROM api_tokens ORDER BY t`)
      ).rows;
    const before = await counts();
    const { call } = await connect(secret);
    for (const [name, args] of ALL_CALLS) await call(name, args);
    expect(await counts()).toEqual(before);
  });
});
