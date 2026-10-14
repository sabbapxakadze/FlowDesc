import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { eq } from "drizzle-orm";

// Only the mail provider's client is replaced, so the real route, the real checks and the real email template run and the message that WOULD be
// sent can be read (the same way lib/email.test.ts does it).
type Sent = { from: string; to: string; subject: string; html: string; replyTo?: string; attachments?: { filename: string; content: Buffer }[] };
const send = vi.hoisted(() => vi.fn<(message: Sent) => Promise<{ error: { message: string } | null }>>(async () => ({ error: null })));
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));

import { app } from "../../app.js";
import { env } from "../../config/env.js";
import { db } from "../../db/client.js";
import { organizations } from "../../db/schema/index.js";
import { resetDatabase } from "../../db/test-utils.js";

/**
 * "Report a bug" (ADR 0075), over real HTTP and the real database; only the mail provider is replaced. Each test says what it protects.
 */

const PASSWORD = "password123";
type Session = { token: string; organizationId: string };

async function registerAndLogIn(email = "owner@example.com", name = "Owner Person", organizationName = "Org A"): Promise<Session> {
  await request(app).post("/api/v1/auth/register").send({ email, password: PASSWORD, name, organizationName }).expect(201);
  const res = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD }).expect(200);
  send.mockClear(); // registering sends its own verification email through the same (replaced) provider; these tests count only the report
  return { token: res.body.accessToken, organizationId: res.body.organization.id };
}
const as = (s: Session) => ({ Authorization: `Bearer ${s.token}` });

/** Starts like a real PNG (that is all the server looks at), with some filler so it has a size. */
const png = (extra = 16) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(extra, 1)]);
const jpeg = () => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(16, 2)]);

const report = (s: Session) => request(app).post("/api/v1/bug-reports").set(as(s));
const lastSent = () => send.mock.calls.at(-1)![0];

beforeEach(async () => {
  await resetDatabase();
  send.mockClear();
  send.mockResolvedValue({ error: null });
});

describe("sending a report", () => {
  it("emails one message to support with the person as Reply-To, the screenshots attached and the context in the body", async () => {
    // Why: the whole feature. The owner must be able to answer by replying, see what the person saw, and know who and where.
    const owner = await registerAndLogIn();
    await report(owner)
      .field("description", "The board does not load\nafter I drag a card")
      .field("page", "/projects/WEB?issue=WEB-3")
      .field("viewport", "1280x720")
      .set("User-Agent", "TestBrowser/1.0")
      .attach("screenshots", png(), { filename: "a.png", contentType: "image/png" })
      .attach("screenshots", jpeg(), { filename: "b.jpg", contentType: "image/jpeg" })
      .expect(201, { data: { sent: true } });

    expect(send).toHaveBeenCalledTimes(1);
    const sent = lastSent();
    expect(sent.to).toBe(env.BUG_REPORT_TO ?? env.EMAIL_FROM);
    expect(sent.replyTo).toBe("owner@example.com");
    expect(sent.subject).toBe("Bug report from Owner Person: The board does not load");
    expect(sent.html).toContain("The board does not load\nafter I drag a card");
    expect(sent.html).toContain("Owner Person &lt;owner@example.com&gt;");
    expect(sent.html).toContain("Org A");
    expect(sent.html).toContain("/projects/WEB?issue=WEB-3");
    expect(sent.html).toContain("1280x720");
    expect(sent.html).toContain("TestBrowser/1.0");
    expect(sent.attachments?.map((a) => a.filename)).toEqual(["screenshot-1.png", "screenshot-2.jpg"]);
    expect(sent.attachments?.[0]?.content.equals(png())).toBe(true);
  });

  it("works with no screenshots", async () => {
    // Why: most reports are just words; the pictures are optional.
    const owner = await registerAndLogIn();
    await report(owner).field("description", "Typo on the Account page").expect(201);
    expect(lastSent().attachments ?? []).toEqual([]);
  });

  it("takes who is reporting from the database, never from what the form says", async () => {
    // Why: otherwise anyone could send a report that looks like it came from somebody else, with that person's address as Reply-To.
    const owner = await registerAndLogIn();
    await report(owner)
      .field("description", "Something broke")
      .field("name", "Somebody Else")
      .field("email", "victim@example.com")
      .expect(201);
    expect(lastSent().replyTo).toBe("owner@example.com");
    expect(lastSent().html).not.toContain("victim@example.com");
    expect(lastSent().html).not.toContain("Somebody Else");
  });

  it("escapes what people typed, and a line break cannot reach the subject", async () => {
    // Why: the text goes into an HTML email and a subject header. Markup must show as text, and a newline in the subject must never become a header.
    const owner = await registerAndLogIn("owner@example.com", "Evil\r\nBcc: x@example.com <b>Name</b>");
    await report(owner).field("description", "<script>alert(1)</script> and <img src=x onerror=y>").expect(201);
    const sent = lastSent();
    expect(sent.html).not.toContain("<script>");
    expect(sent.html).not.toContain("<img src=x");
    expect(sent.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(sent.subject).not.toMatch(/[\r\n]/);
  });
});

describe("what it refuses, without sending anything", () => {
  it("needs a description", async () => {
    // Why: an empty report tells the owner nothing.
    const owner = await registerAndLogIn();
    const res = await report(owner).field("description", "   ").expect(400);
    expect(res.body.error.code).toBe("validation_error");
    await report(owner).expect(400);
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses a file that is not really a PNG, JPEG or WebP, whatever its name and claimed type say", async () => {
    // Why: the file goes into someone's inbox. Its name and the type the browser claims are just what the sender wrote; only its bytes count.
    const owner = await registerAndLogIn();
    const res = await report(owner)
      .field("description", "Look at this")
      .attach("screenshots", Buffer.from("MZ this is an executable, not a picture"), { filename: "photo.png", contentType: "image/png" })
      .expect(400);
    expect(res.body.error.code).toBe("unsupported_file_type");
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses more than three screenshots, and one over 5 MB", async () => {
    // Why: the limits keep one report from becoming a huge email. They are checked on the server, not only in the form.
    const owner = await registerAndLogIn();
    let many = report(owner).field("description", "Four pictures");
    for (let i = 0; i < 4; i += 1) many = many.attach("screenshots", png(), { filename: `${i}.png`, contentType: "image/png" });
    expect((await many.expect(400)).body.error.code).toBe("too_many_files");

    const big = await report(owner)
      .field("description", "A big picture")
      .attach("screenshots", png(5 * 1024 * 1024), { filename: "big.png", contentType: "image/png" })
      .expect(400);
    expect(big.body.error.code).toBe("file_too_large");
    expect(send).not.toHaveBeenCalled();
  });

  it("needs a signed-in person", async () => {
    // Why: only logged-in people may send (ADR 0075); otherwise anyone could fill the owner's inbox.
    await request(app).post("/api/v1/bug-reports").field("description", "Hello").expect(401);
    expect(send).not.toHaveBeenCalled();
  });

  it("is closed to access tokens, even one with write access", async () => {
    // Why: a leaked token must not be able to send email from FlowDesc. The address is not on the token allowlist (ADR 0070, 0074).
    const owner = await registerAndLogIn();
    const made = await request(app).post("/api/v1/users/me/api-tokens").set(as(owner)).send({ name: "t", scope: "read_write", expiresInDays: 30 }).expect(201);
    const res = await request(app)
      .post("/api/v1/bug-reports")
      .set({ Authorization: `Bearer ${made.body.token}` })
      .field("description", "From a token")
      .expect(403);
    expect(res.body.error.code).toBe("token_not_allowed");
    expect(send).not.toHaveBeenCalled();
  });

  it("is not available in a demo copy", async () => {
    // Why: the demo is public and anyone can start one. A demo visitor must not be able to send email to the owner (ADR 0044).
    const owner = await registerAndLogIn();
    await db.update(organizations).set({ demoExpiresAt: new Date(Date.now() + 60 * 60 * 1000) }).where(eq(organizations.id, owner.organizationId));
    const res = await report(owner).field("description", "From the demo").expect(403);
    expect(res.body.error.code).toBe("demo_restricted");
    expect(send).not.toHaveBeenCalled();
  });
});

describe("when the email cannot be sent", () => {
  it("tells the person, instead of pretending it worked", async () => {
    // Why: a report that quietly vanished is worse than none. The person must see the failure and where else to write.
    const owner = await registerAndLogIn();
    send.mockResolvedValueOnce({ error: { message: "provider is down" } });
    const res = await report(owner).field("description", "Please read this").expect(502);
    expect(res.body.error.code).toBe("report_not_sent");
    expect(res.body.error.message).toContain("support@flowdesc.app");
  });
});
