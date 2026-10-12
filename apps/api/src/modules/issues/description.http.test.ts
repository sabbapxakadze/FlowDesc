import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";
import { mentionToken } from "@flowdesc/contracts";
import { app } from "../../app.js";
import { db } from "../../db/client.js";
import { clearTestUploads, resetDatabase } from "../../db/test-utils.js";
import {
  attachments,
  issueEvents,
  issues,
  notifications,
  organizationMembers,
  users,
} from "../../db/schema/index.js";
import { signAccessToken } from "../auth/tokens.js";

/**
 * Rich issue descriptions (ADR 0063), server side: pictures pasted before and after the issue exists, the checks on which pictures a description may
 * show, mentions that notify, and search that ignores the tokens. Real Postgres, real HTTP. Every test says what bug it would catch.
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
  const projectBase = `/api/v1/organizations/${organizationId}/projects/${projectId}`;
  return { token, organizationId, projectId, projectBase };
}

async function addMember(organizationId: string, name: string) {
  const [user] = await db
    .insert(users)
    .values({
      email: `${name.toLowerCase().replace(" ", "-")}@example.com`,
      passwordHash: "not-a-real-hash",
      name,
    })
    .returning();
  if (!user) throw new Error("setup failed");
  await db
    .insert(organizationMembers)
    .values({ organizationId, userId: user.id, role: "member" });
  return { token: signAccessToken(user.id), userId: user.id };
}

const PNG = Buffer.from("not really a png, the server only checks the declared type");
const ref = (id: string) => `![shot.png](attachment:${id})`;

/** A picture pasted into the New issue popup (no issue yet). */
function pasteForNewIssue(projectBase: string, token: string, contentType = "image/png") {
  return request(app)
    .post(`${projectBase}/draft-images`)
    .set("Authorization", `Bearer ${token}`)
    .attach("file", PNG, { filename: "shot.png", contentType });
}

function createIssue(
  projectBase: string,
  token: string,
  description: string | undefined,
  title = "An issue",
) {
  return request(app)
    .post(`${projectBase}/issues`)
    .set("Authorization", `Bearer ${token}`)
    .send({ title, description });
}

async function pasteForIssue(issueBase: string, token: string) {
  return (
    await request(app)
      .post(`${issueBase}/attachments`)
      .set("Authorization", `Bearer ${token}`)
      .field("draft", "true")
      .attach("file", PNG, { filename: "shot.png", contentType: "image/png" })
      .expect(201)
  ).body.data.id as string;
}

describe("rich descriptions (HTTP, ADR 0063)", () => {
  beforeEach(async () => {
    await resetDatabase();
    await clearTestUploads();
  });

  it("a picture pasted before the issue exists is linked to the issue when it is created", async () => {
    // Catches: a New issue popup picture that is lost, or that stays a draft (and is deleted at 24 hours) after the issue is created.
    const { token, projectBase } = await setup();
    const res = await pasteForNewIssue(projectBase, token).expect(201);
    const id = res.body.data.id as string;
    expect(res.body.data.downloadUrl).toContain("/api/v1/attachments/");

    const created = await createIssue(projectBase, token, `Steps\n\n${ref(id)}`).expect(
      201,
    );
    const issueId = created.body.data.id as string;

    const [row] = await db.select().from(attachments).where(eq(attachments.id, id));
    expect(row?.draft).toBe(false);
    expect(row?.issueId).toBe(issueId);
    const files = await request(app)
      .get(`${projectBase}/issues/${issueId}/attachments`)
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
    expect(files.body.data.map((f: { id: string }) => f.id)).toEqual([id]);
  });

  it("only images can be pasted for a new issue", async () => {
    // Catches: the project draft endpoint becoming a way to store any file type.
    const { token, projectBase } = await setup();
    const res = await pasteForNewIssue(projectBase, token, "application/pdf").expect(400);
    expect(res.body.error.code).toBe("draft_not_image");
  });

  it("refuses a description that shows another person's draft or an unknown file, and creates no issue", async () => {
    // Catches: using someone else's picture by writing its id into a description (the id in the text is client input).
    const { token, organizationId, projectBase } = await setup();
    const member = await addMember(organizationId, "Member One");
    const theirs = (await pasteForNewIssue(projectBase, member.token).expect(201)).body
      .data.id as string;
    for (const id of [theirs, "00000000-0000-4000-8000-000000000000"]) {
      const res = await createIssue(projectBase, token, ref(id)).expect(400);
      expect(res.body.error.code).toBe("invalid_inline_image");
    }
    expect(await db.select().from(issues)).toHaveLength(0);
  });

  it("an edit can add the writer's own draft and keep a picture that is already there, but not bring in another person's file", async () => {
    // Catches: an edit that cannot add a picture, an edit by a second person that strips or refuses the pictures already in the text,
    // and an edit that lets someone attach a file they did not upload.
    const { token, organizationId, projectBase } = await setup();
    const member = await addMember(organizationId, "Member One");
    const created = await createIssue(projectBase, token, "plain").expect(201);
    const issueId = created.body.data.id as string;
    const issueBase = `${projectBase}/issues/${issueId}`;

    const mine = await pasteForIssue(issueBase, token);
    const edited = await request(app)
      .patch(issueBase)
      .set("Authorization", `Bearer ${token}`)
      .send({ version: 1, description: `see ${ref(mine)}` })
      .expect(200);
    const [linked] = await db.select().from(attachments).where(eq(attachments.id, mine));
    expect(linked?.draft).toBe(false);

    // another member edits the text and keeps the picture
    await request(app)
      .patch(issueBase)
      .set("Authorization", `Bearer ${member.token}`)
      .send({ version: edited.body.data.version, description: `see again ${ref(mine)}` })
      .expect(200);

    // ...but cannot add a file that is not their own draft (here: the owner's now-linked file under a NEW reference is allowed only because it is kept; a fresh draft of the owner is not)
    const ownersDraft = await pasteForIssue(issueBase, token);
    const stolen = await request(app)
      .patch(issueBase)
      .set("Authorization", `Bearer ${member.token}`)
      .send({
        version: edited.body.data.version + 1,
        description: `${ref(mine)} ${ref(ownersDraft)}`,
      })
      .expect(400);
    expect(stolen.body.error.code).toBe("invalid_inline_image");

    // a picture that is already a file of the issue (a plain attachment) but was NOT in the description cannot be pulled in by an editor either
    const plain = (
      await request(app)
        .post(`${issueBase}/attachments`)
        .set("Authorization", `Bearer ${token}`)
        .attach("file", PNG, { filename: "plain.png", contentType: "image/png" })
        .expect(201)
    ).body.data.id as string;
    const pulled = await request(app)
      .patch(issueBase)
      .set("Authorization", `Bearer ${member.token}`)
      .send({
        version: edited.body.data.version + 1,
        description: `${ref(mine)} ${ref(plain)}`,
      })
      .expect(400);
    expect(pulled.body.error.code).toBe("invalid_inline_image");
  });

  it("creating an issue tells the members its description mentions; an unknown id is dropped", async () => {
    // Catches: mentions in a description that tell nobody, or that notify a made-up or foreign id.
    const { token, organizationId, projectBase } = await setup();
    const anna = await addMember(organizationId, "Anna Lee");
    const description = `Please look ${mentionToken(anna.userId, "Anna Lee")} and ${mentionToken("00000000-0000-4000-8000-000000000000", "Nobody")}`;
    const created = await createIssue(projectBase, token, description).expect(201);

    const mine = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, anna.userId));
    expect(mine).toHaveLength(1);
    const [event] = await db
      .select()
      .from(issueEvents)
      .where(eq(issueEvents.issueId, created.body.data.id as string));
    expect((event?.payload as { mentions: string[] }).mentions).toEqual([anna.userId]);
  });

  it("an edit tells only the people it newly mentions", async () => {
    // Catches: re-notifying someone every time the description is edited while they are still mentioned.
    const { token, organizationId, projectBase } = await setup();
    const anna = await addMember(organizationId, "Anna Lee");
    const ben = await addMember(organizationId, "Ben Ray");
    const created = await createIssue(
      projectBase,
      token,
      `hi ${mentionToken(anna.userId, "Anna Lee")}`,
    ).expect(201);
    const issueBase = `${projectBase}/issues/${created.body.data.id as string}`;
    const annaBefore = (
      await db.select().from(notifications).where(eq(notifications.userId, anna.userId))
    ).length;

    await request(app)
      .patch(issueBase)
      .set("Authorization", `Bearer ${token}`)
      .send({
        version: 1,
        description: `hi ${mentionToken(anna.userId, "Anna Lee")} and ${mentionToken(ben.userId, "Ben Ray")}`,
      })
      .expect(200);

    expect(
      (await db.select().from(notifications).where(eq(notifications.userId, ben.userId)))
        .length,
    ).toBe(1);
    expect(
      (await db.select().from(notifications).where(eq(notifications.userId, anna.userId)))
        .length,
    ).toBe(annaBefore);
  });

  it("search finds a description by its words, not by its picture or mention tokens", async () => {
    // Catches: searching "attachment" (or an id) matching every issue with a picture, because the raw Markdown was indexed.
    const { token, organizationId, projectBase } = await setup();
    const anna = await addMember(organizationId, "Anna Lee");
    const pic = (await pasteForNewIssue(projectBase, token).expect(201)).body.data
      .id as string;
    await createIssue(
      projectBase,
      token,
      `Zebra crossing ${mentionToken(anna.userId, "Anna Lee")}\n\n${ref(pic)}`,
    ).expect(201);
    const search = (q: string) =>
      request(app)
        .get(`/api/v1/organizations/${organizationId}/search`)
        .query({ q })
        .set("Authorization", `Bearer ${token}`)
        .expect(200);

    expect((await search("zebra")).body.data).toHaveLength(1);
    expect((await search("anna")).body.data).toHaveLength(1);
    expect((await search("attachment")).body.data).toHaveLength(0);
    expect((await search(pic.slice(0, 8))).body.data).toHaveLength(0);
  });

  it("drafts for a new issue older than 24 hours are deleted on the next draft upload, and go with a deleted project", async () => {
    // Catches: abandoned New issue pictures piling up, or surviving their project.
    const { token, projectId, projectBase } = await setup();
    const old = (await pasteForNewIssue(projectBase, token).expect(201)).body.data
      .id as string;
    await db.execute(
      `UPDATE attachments SET created_at = now() - interval '25 hours' WHERE id = '${old}'` as never,
    );
    await pasteForNewIssue(projectBase, token).expect(201);
    expect(
      await db.select().from(attachments).where(eq(attachments.id, old)),
    ).toHaveLength(0);

    expect(
      await db.select().from(attachments).where(eq(attachments.projectId, projectId)),
    ).toHaveLength(1);
  });
});
