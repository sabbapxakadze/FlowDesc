import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { eq, sql } from "drizzle-orm";
import { app } from "../../app.js";
import { db } from "../../db/client.js";
import { clearTestUploads, resetDatabase } from "../../db/test-utils.js";
import {
  attachments,
  notifications,
  organizationMembers,
  users,
} from "../../db/schema/index.js";
import { signAccessToken } from "../auth/tokens.js";

/**
 * Pictures pasted into comments (ADR 0062), server side: a draft upload, and posting or editing a comment that shows it. Real Postgres, real HTTP.
 * Every test says what bug it would catch.
 */
async function setup() {
  await request(app)
    .post("/api/v1/auth/register")
    .send({
      email: "owner@example.com",
      password: "password123",
      name: "Owner User",
      organizationName: "Org A",
    })
    .expect(201);
  const login = await request(app)
    .post("/api/v1/auth/login")
    .send({ email: "owner@example.com", password: "password123" })
    .expect(200);
  const token = login.body.accessToken as string;
  const organizationId = login.body.organization.id as string;
  const projectId = (
    await request(app)
      .post(`/api/v1/organizations/${organizationId}/projects`)
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Project", key: "AAA" })
      .expect(201)
  ).body.data.id as string;
  const newIssue = async (title: string) =>
    `/api/v1/organizations/${organizationId}/projects/${projectId}/issues/${
      (
        await request(app)
          .post(`/api/v1/organizations/${organizationId}/projects/${projectId}/issues`)
          .set("Authorization", `Bearer ${token}`)
          .send({ title })
          .expect(201)
      ).body.data.id as string
    }`;
  return { token, organizationId, newIssue };
}

async function addMember(organizationId: string) {
  const [user] = await db
    .insert(users)
    .values({
      email: "member@example.com",
      passwordHash: "not-a-real-hash",
      name: "Member One",
    })
    .returning();
  if (!user) throw new Error("setup failed");
  await db
    .insert(organizationMembers)
    .values({ organizationId, userId: user.id, role: "member" });
  return signAccessToken(user.id);
}

const PNG = Buffer.from("not really a png, the server only checks the declared type");

/** Uploads a picture as a draft and returns the response. */
function pasteDraft(base: string, token: string, contentType = "image/png") {
  return request(app)
    .post(`${base}/attachments`)
    .set("Authorization", `Bearer ${token}`)
    .field("draft", "true")
    .attach("file", PNG, { filename: "shot.png", contentType });
}

const ref = (id: string) => `![shot.png](attachment:${id})`;

function comment(base: string, token: string, body: string) {
  return request(app)
    .post(`${base}/comments`)
    .set("Authorization", `Bearer ${token}`)
    .send({ body });
}

describe("pictures pasted into comments (HTTP, ADR 0062)", () => {
  beforeEach(async () => {
    await resetDatabase();
    await clearTestUploads();
  });

  it("a draft upload is silent: no event, no notification, and not in the issue's file list", async () => {
    // Catches: a paste announcing itself to the whole issue before anyone has posted anything (the reason drafts exist).
    const { token, organizationId, newIssue } = await setup();
    const base = await newIssue("Has a draft");
    const memberToken = await addMember(organizationId);
    await comment(base, memberToken, "I am a participant who could be notified").expect(
      201,
    );
    const notificationsBefore = (await db.select().from(notifications)).length;

    const res = await pasteDraft(base, token).expect(201);
    expect(res.body.data.id).toBeTruthy();

    const events = (
      await request(app)
        .get(`${base}/events`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200)
    ).body.data as Array<{ type: string }>;
    expect(events.some((e) => e.type === "issue.attachment_added")).toBe(false);
    expect((await db.select().from(notifications)).length).toBe(notificationsBefore);
    const files = await request(app)
      .get(`${base}/attachments`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(files.body.data).toEqual([]);
  });

  it("only images can be drafts", async () => {
    // Catches: a PDF or video pasted inline, which the comment text could not draw (videos stay attachments).
    const { token, newIssue } = await setup();
    const base = await newIssue("Not an image");
    const res = await pasteDraft(base, token, "application/pdf").expect(400);
    expect(res.body.error.code).toBe("draft_not_image");
  });

  it("posting a comment that shows a draft links it to the comment; an edit can add another", async () => {
    // Catches: pictures that stay drafts after posting (and are deleted at 24 hours), or an edit that cannot add one.
    const { token, newIssue } = await setup();
    const base = await newIssue("Post and edit");
    const first = (await pasteDraft(base, token).expect(201)).body.data.id as string;
    const posted = await comment(base, token, `Look ${ref(first)}`).expect(201);
    const commentId = posted.body.data.id as string;

    const [row] = await db.select().from(attachments).where(eq(attachments.id, first));
    expect(row?.draft).toBe(false);
    expect(row?.commentId).toBe(commentId);
    const files = await request(app)
      .get(`${base}/attachments`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(files.body.data.map((f: { id: string }) => f.id)).toEqual([first]);

    const second = (await pasteDraft(base, token).expect(201)).body.data.id as string;
    await request(app)
      .patch(`${base}/comments/${commentId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ body: `Look ${ref(first)} and ${ref(second)}` })
      .expect(200);
    const [added] = await db.select().from(attachments).where(eq(attachments.id, second));
    expect(added?.commentId).toBe(commentId);
    expect(added?.draft).toBe(false);
  });

  it("refuses pictures that are not the writer's own draft on this issue, and saves nothing", async () => {
    // Catches: using someone else's file, or a file of another issue, by writing its id into a comment (the id in the text is client input).
    const { token, organizationId, newIssue } = await setup();
    const base = await newIssue("Target");
    const other = await newIssue("Another issue");
    const memberToken = await addMember(organizationId);
    const mine = (await pasteDraft(other, token).expect(201)).body.data.id as string; // on another issue
    const theirs = (await pasteDraft(base, memberToken).expect(201)).body.data
      .id as string; // someone else's draft
    const pdf = (
      await request(app)
        .post(`${base}/attachments`)
        .set("Authorization", `Bearer ${token}`)
        .attach("file", PNG, { filename: "a.pdf", contentType: "application/pdf" })
        .expect(201)
    ).body.data.id as string; // a real file, but not a draft and not an image
    const unknown = "00000000-0000-4000-8000-000000000000";

    for (const id of [mine, theirs, pdf, unknown]) {
      const res = await comment(base, token, ref(id)).expect(400);
      expect(res.body.error.code).toBe("invalid_inline_image");
    }
    const timeline = (
      await request(app)
        .get(`${base}/events`)
        .set("Authorization", `Bearer ${token}`)
        .expect(200)
    ).body.data as Array<{ type: string }>;
    expect(timeline.some((e) => e.type === "issue.commented")).toBe(false);
  });

  it("allows at most 10 pictures in one comment", async () => {
    // Catches: no limit, so one comment could carry unbounded files.
    const { token, newIssue } = await setup();
    const base = await newIssue("Many");
    const ids: string[] = [];
    for (let i = 0; i < 11; i++)
      ids.push((await pasteDraft(base, token).expect(201)).body.data.id as string);
    const res = await comment(base, token, ids.map(ref).join("\n")).expect(400);
    expect(res.body.error.code).toBe("too_many_inline_images");
    await comment(base, token, ids.slice(0, 10).map(ref).join("\n")).expect(201);
  });

  it("deletes drafts older than 24 hours on the next draft upload, and keeps younger ones", async () => {
    // Catches: pasted-and-abandoned pictures piling up in storage forever.
    const { token, newIssue } = await setup();
    const base = await newIssue("Cleanup");
    const old = (await pasteDraft(base, token).expect(201)).body.data.id as string;
    const young = (await pasteDraft(base, token).expect(201)).body.data.id as string;
    await db.execute(
      sql`UPDATE attachments SET created_at = now() - interval '25 hours' WHERE id = ${old}`,
    );

    await pasteDraft(base, token).expect(201);

    expect(
      await db.select().from(attachments).where(eq(attachments.id, old)),
    ).toHaveLength(0);
    expect(
      await db.select().from(attachments).where(eq(attachments.id, young)),
    ).toHaveLength(1);
  });
});
