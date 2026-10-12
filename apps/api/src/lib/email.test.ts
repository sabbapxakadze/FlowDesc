import { existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

// Only the mail provider's client is replaced, so the real templates and the real frame run and the HTML that would be sent can be read.
const send = vi.hoisted(() => vi.fn<(message: { from: string; to: string; subject: string; html: string }) => Promise<{ error: null }>>(async () => ({ error: null })));
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));

import { env } from "../config/env.js";
import { sendPasswordResetEmail, sendVerificationEmail } from "./email.js";

describe("the frame every email is sent in (ADR 0068)", () => {
  it("puts the FlowDesc mark, the name and the copyright line around the message, and keeps the message and its link", async () => {
    // Why: the frame is added in one place (sendEmail), so a template can never forget it, and this proves the message itself still arrives intact inside it.
    await sendPasswordResetEmail("person@example.com", "tok123");
    const sent = send.mock.calls.at(-1)![0];
    expect(sent.to).toBe("person@example.com");
    expect(sent.from).toBe(env.EMAIL_FROM);
    expect(sent.subject).toBe("Reset your FlowDesc password");
    expect(sent.html).toContain(`src="${env.APP_URL}/email-logo.png"`);
    expect(sent.html).toContain("Flow<span");
    expect(sent.html).toContain(`${env.APP_URL}/reset-password?token=tok123`);
    expect(sent.html).toContain("Reset password");
    expect(sent.html).toContain("2026 FlowDesc. All rights reserved.");
  });

  it("frames the other emails the same way", async () => {
    await sendVerificationEmail("person@example.com", "tok456");
    const sent = send.mock.calls.at(-1)![0];
    expect(sent.html).toContain("/email-logo.png");
    expect(sent.html).toContain(`${env.APP_URL}/verify-email?token=tok456`);
  });

  it("points at a logo file that really exists in the web app's public folder", () => {
    // Why: the email links to https://<the app>/email-logo.png. If the file is renamed or removed, every email shows a broken picture and nothing else notices.
    expect(existsSync(new URL("../../../web/public/email-logo.png", import.meta.url))).toBe(true);
  });
});
