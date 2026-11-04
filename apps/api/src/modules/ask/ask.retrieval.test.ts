import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "../../app.js";
import { resetDatabase } from "../../db/test-utils.js";
import { LIMITS, retrieveSources } from "./ask.retrieval.js";

/**
 * Retrieval, phase A (ADR 0077), over the real database. The data is made through the real HTTP API, so what is searched is exactly what the app stores.
 * No model is involved. Each test says what it protects; the one that matters most is the organization test: nothing from another organization may ever
 * appear, whatever the question.
 */

const TODAY = "2026-11-04"; // a Wednesday: the week is Monday 2026-11-02 to Sunday 2026-11-08

type Org = { token: string; organizationId: string; userId: string; projectId: string; key: string };
const as = (o: Org) => ({ Authorization: `Bearer ${o.token}` });
const base = (o: Org) => `/api/v1/organizations/${o.organizationId}/projects/${o.projectId}`;

async function makeOrg(email: string, organizationName: string, key: string): Promise<Org> {
  await request(app).post("/api/v1/auth/register").send({ email, password: "password123", name: "Olivia Owner", organizationName }).expect(201);
  const login = await request(app).post("/api/v1/auth/login").send({ email, password: "password123" }).expect(200);
  const org = { token: login.body.accessToken as string, organizationId: login.body.organization.id as string, userId: login.body.user.id as string };
  const project = await request(app)
    .post(`/api/v1/organizations/${org.organizationId}/projects`)
    .set({ Authorization: `Bearer ${org.token}` })
    .send({ name: `${key} project`, key })
    .expect(201);
  return { ...org, projectId: project.body.data.id as string, key };
}

type Extra = { description?: string; status?: "todo" | "in_progress" | "done"; dueDate?: string; assignee?: string | null };
async function addIssue(o: Org, title: string, extra: Extra = {}) {
  const created = await request(app).post(`${base(o)}/issues`).set(as(o)).send({ title, description: extra.description }).expect(201);
  const issue = created.body.data as { id: string; number: number; version: number };
  const changes: Record<string, unknown> = {};
  if (extra.status) changes.status = extra.status;
  if (extra.dueDate) changes.dueDate = extra.dueDate;
  if (extra.assignee !== undefined) changes.assigneeId = extra.assignee;
  if (Object.keys(changes).length > 0) {
    await request(app).patch(`${base(o)}/issues/${issue.id}`).set(as(o)).send({ version: issue.version, ...changes }).expect(200);
  }
  return { id: issue.id, key: `${o.key}-${issue.number}` };
}
async function addComment(o: Org, issueId: string, body: string) {
  const res = await request(app).post(`${base(o)}/issues/${issueId}/comments`).set(as(o)).send({ body }).expect(201);
  return res.body.data.id as string;
}

const ask = (o: Org, question: string) => retrieveSources({ organizationId: o.organizationId, userId: o.userId, question, today: TODAY });
const keys = async (o: Org, question: string) => (await ask(o, question)).sources.map((s) => s.key);

beforeEach(resetDatabase);

describe("text questions", () => {
  it("finds an issue by a word in its title, in its description, or only in one of its comments", async () => {
    // Why: the three places a fact can live. Comments are where decisions usually are, so a comment-only match must lead to its issue.
    const o = await makeOrg("o@example.com", "Org A", "WEB");
    const byTitle = await addIssue(o, "Redesign the pricing page");
    const byDescription = await addIssue(o, "Landing tweaks", { description: "We need a cookie banner for the EU" });
    const byComment = await addIssue(o, "Database chores");
    await addComment(o, byComment.id, "We decided to index the invoices table first");

    expect(await keys(o, "pricing")).toEqual([byTitle.key]);
    expect(await keys(o, "cookie banner")).toEqual([byDescription.key]);
    expect(await keys(o, "invoices")).toEqual([byComment.key]);
  });

  it("matches a natural question where only some words appear (any word, not all)", async () => {
    // Why: a plain text query needs every word, which a real question never satisfies. "checkout" is nowhere in the issue, yet it must be found.
    const o = await makeOrg("o@example.com", "Org A", "WEB");
    const payment = await addIssue(o, "Payment page crashes on submit");
    await addIssue(o, "Update the footer colours");
    expect(await keys(o, "Why did the checkout payment page crash for customers?")).toEqual([payment.key]);
  });

  it("ranks a title match above a match only in the description", async () => {
    // Why: the title says what an issue is about; the best match should be read first when there is room for only some.
    const o = await makeOrg("o@example.com", "Org A", "WEB");
    const inDescription = await addIssue(o, "Housekeeping", { description: "Also fix the invoice export while there" });
    const inTitle = await addIssue(o, "Invoice export is wrong");
    expect(await keys(o, "invoice export")).toEqual([inTitle.key, inDescription.key]);
  });

  it("follows edits and forgets deleted comments", async () => {
    // Why: a deleted comment must never come back through search (its text stays in the history, which is never read), and an edit must replace the old text.
    const o = await makeOrg("o@example.com", "Org A", "WEB");
    const issue = await addIssue(o, "Hardware");
    const removed = await addComment(o, issue.id, "The flux capacitor is broken");
    const edited = await addComment(o, issue.id, "The warp coil is loose");
    expect(await keys(o, "flux capacitor")).toEqual([issue.key]);

    await request(app).delete(`${base(o)}/issues/${issue.id}/comments/${removed}`).set(as(o)).expect(204);
    await request(app).patch(`${base(o)}/issues/${issue.id}/comments/${edited}`).set(as(o)).send({ body: "The warp coil was replaced" }).expect(200);

    expect(await keys(o, "flux capacitor")).toEqual([]);
    expect(await keys(o, "warp coil")).toEqual([issue.key]);
    const sources = (await ask(o, "warp coil")).sources;
    expect(JSON.stringify(sources)).not.toContain("flux capacitor");
    expect(sources[0]!.comments.map((c) => c.text)).toContain("The warp coil was replaced");
    expect(JSON.stringify(sources)).not.toContain("is loose");
  });

  it("searches the name in a mention, never the id inside it", async () => {
    // Why: a mention is stored as `@[Name](user:<id>)`. The name is meaningful; the id would make a question made of hex digits find things by accident.
    const o = await makeOrg("o@example.com", "Org A", "WEB");
    const issue = await addIssue(o, "Review");
    await addComment(o, issue.id, `Please check with @[Olivia Owner](user:${o.userId})`);
    expect(await keys(o, "olivia")).toEqual([issue.key]);
    expect(await keys(o, o.userId)).toEqual([]);
    expect((await ask(o, "olivia")).sources[0]!.comments[0]!.text).toBe("Please check with @Olivia Owner");
  });

  it("returns nothing, without an error, for questions with nothing to search, and shrugs off SQL-looking text", async () => {
    // Why: "no sources" is a normal answer (the model is then not called), and the question reaches Postgres only as a bound value.
    const o = await makeOrg("o@example.com", "Org A", "WEB");
    const issue = await addIssue(o, "Pricing page");
    for (const question of ["what is the", "   ", "?!", "'); drop table issues;--", "\" OR 1=1 --", "a:*b <-> c & !d | (e)"]) {
      expect((await ask(o, question)).sources, question).toEqual([]);
    }
    expect(await keys(o, "pricing")).toEqual([issue.key]); // the table is still there and still searched
  });
});

describe("issue keys", () => {
  it("fetches a named issue first even when no word matches, in any case, and says plainly when a key names nothing", async () => {
    // Why: "what happened on WEB-2?" is a lookup, not a search. A key that names nothing must be a stated fact, or a model may describe an issue that does not exist.
    const o = await makeOrg("o@example.com", "Org A", "WEB");
    await addIssue(o, "Alpha work");
    const second = await addIssue(o, "Beta work");
    const result = await ask(o, "What happened on web-2? And on WEB-99?");
    expect(result.sources[0]!.key).toBe(second.key);
    expect(result.sources[0]!.why).toContain("named in the question");
    expect(result.facts).toContain("No issue with the key WEB-99 exists in this workspace.");
  });
});

describe("the fixed question types", () => {
  async function dated(o: Org) {
    return {
      oldest: await addIssue(o, "Overdue a", { dueDate: "2026-10-20" }),
      older: await addIssue(o, "Overdue b", { dueDate: "2026-10-30" }),
      doneLate: await addIssue(o, "Finished late", { dueDate: "2026-10-01", status: "done" }),
      today: await addIssue(o, "Due today", { dueDate: TODAY }),
      thisWeek: await addIssue(o, "Due on Friday", { dueDate: "2026-11-06" }),
      later: await addIssue(o, "Due later", { dueDate: "2026-11-20" }),
      noDate: await addIssue(o, "No date"),
    };
  }

  it("overdue: only open issues due before today, the longest overdue first, with the total stated", async () => {
    // Why: keyword search cannot answer this. The definition is the app's own (ADR 0032): due before today and not done.
    const o = await makeOrg("o@example.com", "Org A", "WEB");
    const d = await dated(o);
    const result = await ask(o, "What is overdue?");
    expect(result.sources.map((s) => s.key)).toEqual([d.oldest.key, d.older.key]);
    expect(result.facts).toEqual([`Overdue issues (due before ${TODAY}, not done): 2 in total.`]);
  });

  it("says when the list is longer than what is shown", async () => {
    // Why: "how many are overdue?" needs the real total, not the number of sources that fitted.
    const o = await makeOrg("o@example.com", "Org A", "WEB");
    for (let i = 0; i < 7; i += 1) await addIssue(o, `Late ${i}`, { dueDate: `2026-10-0${i + 1}` });
    const result = await ask(o, "what is overdue");
    expect(result.sources).toHaveLength(LIMITS.perIntent);
    expect(result.facts[0]).toContain("7 in total; the 5 listed are the first ones");
  });

  it("due today and due this week (Monday to Sunday, today included, overdue and finished work left out)", async () => {
    // Why: the same week as the My work page; "this week" must not drag in what is already late or already done.
    const o = await makeOrg("o@example.com", "Org A", "WEB");
    const d = await dated(o);
    expect((await ask(o, "What is due today?")).sources.map((s) => s.key)).toEqual([d.today.key]);
    expect((await ask(o, "What is due this week?")).sources.map((s) => s.key)).toEqual([d.today.key, d.thisWeek.key]);
  });

  it("assigned to me: only this person's open issues", async () => {
    // Why: "me" is the person asking, taken from the verified session and never from the question text.
    const o = await makeOrg("o@example.com", "Org A", "WEB");
    const mine = await addIssue(o, "Mine, open", { assignee: o.userId });
    await addIssue(o, "Mine, finished", { assignee: o.userId, status: "done" });
    await addIssue(o, "Nobody's");
    const result = await ask(o, "What is assigned to me?");
    expect(result.sources.map((s) => s.key)).toEqual([mine.key]);
    expect(result.sources[0]!.assignee).toBe("Olivia Owner");
  });

  it("in progress, and an empty answer is still a stated fact", async () => {
    // Why: "nothing is in progress" is a true answer. The facts carry it even though there are no sources to read.
    const o = await makeOrg("o@example.com", "Org A", "WEB");
    await addIssue(o, "Waiting");
    const empty = await ask(o, "What is in progress?");
    expect(empty.sources).toEqual([]);
    expect(empty.facts).toEqual(["Issues in progress: none."]);

    const active = await addIssue(o, "Being built", { status: "in_progress" });
    expect((await ask(o, "What is in progress?")).sources.map((s) => s.key)).toEqual([active.key]);
  });

  it("puts named issues first, then the lists, then text matches, without repeating an issue", async () => {
    // Why: when there is room for only some, the order of preference decides what is read.
    const o = await makeOrg("o@example.com", "Org A", "WEB");
    const late = await addIssue(o, "Fix the invoice export", { dueDate: "2026-10-20" });
    const text = await addIssue(o, "Invoice template colours");
    const named = await addIssue(o, "Unrelated chore");
    const result = await ask(o, `What is overdue about the invoice? Also ${named.key}.`);
    expect(result.sources.map((s) => s.key)).toEqual([named.key, late.key, text.key]);
    expect(result.sources.map((s) => s.why)).toEqual([`named in the question (${named.key})`, "overdue", "matches the question"]);
  });
});

describe("organizations never mix", () => {
  it("nothing from another organization appears for any kind of question: text, key, overdue, in progress, assigned", async () => {
    // Why: the worst bug this feature could have. Organization B holds a distinctive phrase in a title, a description and a comment, and the issue is
    // overdue, in progress and assigned. Organization A asks every kind of question and must see none of it, and must not even learn that SEC-1 exists.
    const a = await makeOrg("a@example.com", "Org A", "WEB");
    await addIssue(a, "Ordinary work");
    const b = await makeOrg("b@example.com", "Org B", "SEC");
    const secret = await addIssue(b, "Zebra launch codes", {
      description: "The zebra launch phrase is kept here",
      dueDate: "2026-10-01",
      status: "in_progress",
      assignee: b.userId,
    });
    await addComment(b, secret.id, "Rotate the zebra launch codes on Friday");

    for (const question of [
      "zebra launch codes",
      "What happened on SEC-1?",
      "What is overdue?",
      "What is in progress?",
      "What is due this week and assigned to me?",
      "Tell me everything about zebra",
    ]) {
      const result = await ask(a, question);
      const everything = JSON.stringify(result).toLowerCase();
      expect(everything, question).not.toContain("zebra");
      expect(result.sources.every((s) => s.key.startsWith("WEB-")), question).toBe(true);
    }
    // Counts are information too: A has nothing overdue or in progress, so the totals must say none, though B has both.
    expect((await ask(a, "What is overdue?")).facts).toEqual([`Overdue issues (due before ${TODAY}, not done): none.`]);
    expect((await ask(a, "What is in progress?")).facts).toEqual(["Issues in progress: none."]);
    // B's own questions do find it (the data is there; it is only the scope that keeps it out).
    expect((await ask(b, "zebra launch codes")).sources.map((s) => s.key)).toEqual([secret.key]);
    // A question naming B's key states that no such issue exists in A's workspace, which is true and reveals nothing.
    expect((await ask(a, "What happened on SEC-1?")).facts).toEqual(["No issue with the key SEC-1 exists in this workspace."]);
  });
});

describe("the size of what is read", () => {
  it("clips descriptions and comments, keeps at most three comments, and stays inside the character budget", async () => {
    // Why: a prompt, and the Neurons it costs, must stay small however much text an issue holds. At least the first source is always kept.
    const o = await makeOrg("o@example.com", "Org A", "WEB");
    const long = (word: string) => `${word} ${"filler ".repeat(400)}`;
    for (let i = 0; i < 8; i += 1) {
      const issue = await addIssue(o, `Budget topic ${i}`, { description: long("budget") });
      for (let c = 0; c < 5; c += 1) await addComment(o, issue.id, long("budget"));
    }
    const result = await ask(o, "budget");
    expect(result.sources.length).toBeGreaterThanOrEqual(1);
    expect(result.sources.length).toBeLessThan(LIMITS.maxSources); // the budget cut the list short
    expect(result.characters).toBeLessThanOrEqual(LIMITS.sourceCharacters);
    for (const source of result.sources) {
      expect(source.description.length).toBeLessThanOrEqual(LIMITS.description);
      expect(source.comments.length).toBeLessThanOrEqual(LIMITS.commentsPerSource);
      for (const comment of source.comments) expect(comment.text.length).toBeLessThanOrEqual(LIMITS.comment);
    }
  });
});
