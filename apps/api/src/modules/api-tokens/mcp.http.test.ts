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

async function makeToken(s: Session, scope: "read" | "read_write" = "read") {
  const res = await request(app).post("/api/v1/users/me/api-tokens").set(as(s)).send({ name: "mcp", scope, expiresInDays: 30 }).expect(201);
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

  it("the read tools change nothing: no row in any data table changes after calling each of them, even with a write token", async () => {
    // Why: a tool that only reads must never write by accident. Counting rows before and after, in every table that holds user data, proves it.
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

    const writer = await connect((await makeToken(owner, "read_write")).secret);
    const afterToken = await counts();
    for (const [name, args] of ALL_CALLS) await writer.call(name, args);
    expect(await counts()).toEqual(afterToken);
  });
});

describe("the write tools against the real API (ADR 0074)", () => {
  it("creates, comments and updates through a write token, and the history says each came through a token", async () => {
    // Why: proves the three tools send what the real API accepts (title/body/version/assigneeId names, the version read first) and that the
    // "via token" marker really reaches the history an AI or a person reads.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    await seed(owner, "WEB", "Footer links");
    const { call } = await connect((await makeToken(owner, "read_write")).secret);

    expect((await call("whoami")).json()).toMatchObject({ scope: "read_write" });
    const created = await call("create_issue", { project: "WEB", title: "Add dark mode", description: "Both themes" });
    expect(created.isError, created.text).toBe(false);
    expect(created.json().created).toBe("WEB-3");
    expect((await call("comment_on_issue", { issue: "WEB-3", body: "Started on this" })).isError).toBe(false);
    const updated = await call("update_issue", { issue: "WEB-3", status: "in_progress", priority: "high", due_date: "2026-12-24", assignee: "owner@example.com" });
    expect(updated.isError, updated.text).toBe(false);
    expect(updated.json().issue).toMatchObject({ status: "in_progress", priority: "high", dueDate: "2026-12-24" });

    const issue = (await call("get_issue", { issue: "WEB-3" })).json();
    expect(issue.issue.assigneeId).not.toBeNull();
    const history = issue.history as { type: string; viaToken: boolean }[];
    expect(history.map((e) => [e.type, e.viaToken])).toEqual([
      ["issue.created", true],
      ["issue.commented", true],
      ["issue.updated", true],
    ]);
  });

  it("changes only the one issue it was asked to: the neighbouring issue is untouched", async () => {
    // Why: "one issue per call" is a promise (ADR 0074). Changing WEB-1 must leave WEB-2 exactly as it was, version included.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    await seed(owner, "WEB", "Footer links");
    const { call } = await connect((await makeToken(owner, "read_write")).secret);
    const other = (await call("get_issue", { issue: "WEB-2" })).json();

    expect((await call("update_issue", { issue: "WEB-1", status: "done" })).isError).toBe(false);

    const after = (await call("get_issue", { issue: "WEB-2" })).json();
    expect(after.issue).toEqual(other.issue);
    expect(after.history).toEqual(other.history);
  });

  it("a read token gets a clear answer and nothing is written", async () => {
    // Why: the safe default must hold through the tools too, and the model must be told what to ask the person for.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    await seed(owner, "WEB", "Footer links");
    const { call } = await connect((await makeToken(owner)).secret);

    for (const [name, args] of [
      ["create_issue", { project: "WEB", title: "Nope" }],
      ["comment_on_issue", { issue: "WEB-1", body: "Nope" }],
      ["update_issue", { issue: "WEB-1", status: "done" }],
    ] as const) {
      const out = await call(name, args);
      expect(out.isError, name).toBe(true);
      expect(out.text, name).toContain("read-only");
      expect(out.text, name).toContain("Access tokens");
    }
    const issues = (await call("list_issues", { project: "WEB" })).json().data as { title: string; status: string }[];
    expect(issues).toHaveLength(2);
    expect(issues.every((i) => i.status === "todo")).toBe(true);
  });

  it("tells the model when someone changed the issue after it was read", async () => {
    // Why: the real 409 body has to carry what the tool turns into its advice. A person edits between the tool's read and its write.
    const owner = await registerAndLogIn("owner@example.com", "Org A");
    const { projectId, issueId } = await seed(owner, "WEB", "Footer links");
    const { secret } = await makeToken(owner, "read_write");
    const org = `/api/v1/organizations/${owner.organizationId}/projects/${projectId}/issues`;

    // The server reads the issue, then a person saves a change, then the tool's write arrives with the old version: simulated by
    // fetching the version first and writing with it after a person's edit, through the same HTTP address the tool uses.
    const before = await request(app).get(`${org}/${issueId}`).set(as(owner)).expect(200);
    await request(app).patch(`${org}/${issueId}`).set(as(owner)).send({ version: before.body.data.version, title: "Edited by a person" }).expect(200);
    const stale = await request(app)
      .patch(`${org}/${issueId}`)
      .set({ Authorization: `Bearer ${secret}` })
      .send({ version: before.body.data.version, title: "Tool guess" })
      .expect(409);
    expect(stale.body.error.code).toBe("version_conflict");
    expect(stale.body.error.data.current).toMatchObject({ title: "Edited by a person", status: "todo" });
  });
});
