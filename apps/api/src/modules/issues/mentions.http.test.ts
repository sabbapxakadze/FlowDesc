import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq } from "drizzle-orm";
import { mentionToken } from "@flowdesc/contracts";
import { app } from "../../app.js";
import { db } from "../../db/client.js";
import { resetDatabase } from "../../db/test-utils.js";
import { issueEvents, notifications, organizationMembers, users } from "../../db/schema/index.js";
import { signAccessToken } from "../auth/tokens.js";

/**
 * @mentions in comments (ADR 0033). Real Postgres, real HTTP. The ids in a body come from the client, so the main
 * risk is notifying someone who should not hear about it; each test says what bug it would catch.
 */
async function registerAndLogIn(email: string, name: string, organizationName: string) {
  await request(app).post("/api/v1/auth/register").send({ email, password: "password123", name, organizationName }).expect(201);
  const loginRes = await request(app).post("/api/v1/auth/login").send({ email, password: "password123" }).expect(200);
  return { token: loginRes.body.accessToken as string, userId: loginRes.body.user.id as string, organizationId: loginRes.body.organization.id as string };
}

/** No invite flow in this helper: put a second person straight into an organization. */
async function addMember(organizationId: string, name: string) {
  const [user] = await db
    .insert(users)
    .values({ email: `${name.toLowerCase().replace(/ /g, "-")}@example.com`, passwordHash: "not-a-real-hash", name })
    .returning();
  if (!user) throw new Error("setup failed");
  await db.insert(organizationMembers).values({ organizationId, userId: user.id, role: "member" });
  return { token: signAccessToken(user.id), userId: user.id, name };
}

async function setup() {
  const owner = await registerAndLogIn("owner@example.com", "Owner", "Org A");
  const auth = { Authorization: `Bearer ${owner.token}` };
  const projectRes = await request(app)
    .post(`/api/v1/organizations/${owner.organizationId}/projects`)
    .set(auth)
    .send({ name: "Project", key: "AAA" })
    .expect(201);
  const base = `/api/v1/organizations/${owner.organizationId}/projects/${projectRes.body.data.id}`;
  const issueRes = await request(app).post(`${base}/issues`).set(auth).send({ title: "Talk about me" }).expect(201);
  const issueId = issueRes.body.data.id as string;
  const comment = (body: string) => request(app).post(`${base}/issues/${issueId}/comments`).set(auth).send({ body });
  const edit = (commentId: string, body: string) => request(app).patch(`${base}/issues/${issueId}/comments/${commentId}`).set(auth).send({ body });
  const notified = async () => (await db.select().from(notifications)).map((n) => n.userId).sort();
  return { owner, auth, base, issueId, comment, edit, notified };
}

describe("@mentions in comments (HTTP)", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("a person who never touched the issue is notified when mentioned, and the event records who was mentioned", async () => {
    // Catches: a mention that hears nothing (before this, only participants and the assignee were told).
    const { owner, comment, notified, issueId } = await setup();
    const anna = await addMember(owner.organizationId, "Anna Smith");
    await comment(`Hi ${mentionToken(anna.userId, anna.name)}, can you look?`).expect(201);

    expect(await notified()).toEqual([anna.userId]);
    const [event] = await db.select().from(issueEvents).where(and(eq(issueEvents.issueId, issueId), eq(issueEvents.type, "issue.commented")));
    expect((event?.payload as { mentions: string[] }).mentions).toEqual([anna.userId]);
  });

  it("a participant who is also mentioned gets exactly one notification", async () => {
    // Catches: the same person told twice (once as a participant, once as mentioned).
    const { owner, comment, notified, base, issueId } = await setup();
    const anna = await addMember(owner.organizationId, "Anna Smith");
    await request(app).post(`${base}/issues/${issueId}/comments`).set({ Authorization: `Bearer ${anna.token}` }).send({ body: "I was here first" }).expect(201);
    await comment(`Thanks ${mentionToken(anna.userId, anna.name)}`).expect(201);
    // Anna's own comment told only the owner; the owner's comment (Anna is a participant AND mentioned) told Anna once.
    expect(await notified()).toEqual([owner.userId, anna.userId].sort());
  });

  it("mentioning yourself notifies nobody", async () => {
    // Catches: the actor being told about their own words.
    const { owner, comment, notified } = await setup();
    await comment(`Note to ${mentionToken(owner.userId, "Owner")}`).expect(201);
    expect(await notified()).toEqual([]);
  });

  it("a made-up id or a person from another organization is ignored: the comment posts, nobody is told", async () => {
    // Catches: a crafted token notifying an outsider (the notification SQL does not check membership; the service does).
    const { comment, notified } = await setup();
    const other = await registerAndLogIn("other@example.com", "Other Person", "Org B");
    await comment(`Hello ${mentionToken(other.userId, "Other Person")} and ${mentionToken("11111111-1111-4111-8111-111111111111", "Nobody")}`).expect(201);
    expect(await notified()).toEqual([]);
  });

  it("an edit tells only the people it ADDS; an edit with the same or fewer mentions is silent", async () => {
    // Catches: edits notifying everyone mentioned again (spam), or never notifying a newly added person.
    const { owner, comment, edit, notified } = await setup();
    const anna = await addMember(owner.organizationId, "Anna Smith");
    const ben = await addMember(owner.organizationId, "Ben Jones");
    const created = await comment(`Hi ${mentionToken(anna.userId, anna.name)}`).expect(201);
    const commentId = created.body.data.id as string;
    expect(await notified()).toEqual([anna.userId]);

    await edit(commentId, `Hi ${mentionToken(anna.userId, anna.name)}, typo fixed`).expect(200);
    expect(await notified()).toEqual([anna.userId]); // unchanged: Anna was already mentioned

    await edit(commentId, `Hi ${mentionToken(anna.userId, anna.name)} and ${mentionToken(ben.userId, ben.name)}`).expect(200);
    expect(await notified()).toEqual([anna.userId, ben.userId].sort()); // Ben is new; Anna is not told again

    await edit(commentId, "No mentions any more").expect(200);
    expect(await notified()).toEqual([anna.userId, ben.userId].sort()); // removing is silent

    await edit(commentId, `Note to self ${mentionToken(owner.userId, "Owner")}`).expect(200);
    expect(await notified()).toEqual([anna.userId, ben.userId].sort()); // adding yourself tells nobody
  });

  it("the timeline returns the current body with its tokens", async () => {
    // Catches: the folded timeline body losing the tokens the web needs to render the mentions.
    const { owner, comment, base, issueId, auth } = await setup();
    const anna = await addMember(owner.organizationId, "Anna Smith");
    const body = `Hi ${mentionToken(anna.userId, anna.name)}`;
    await comment(body).expect(201);
    const events = await request(app).get(`${base}/issues/${issueId}/events`).set(auth).expect(200);
    const commented = events.body.data.find((e: { type: string }) => e.type === "issue.commented");
    expect(commented.payload.body).toBe(body);
  });
});
