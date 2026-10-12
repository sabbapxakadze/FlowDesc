import { Resend } from "resend";
import { env } from "../config/env.js";
import { logger } from "./logger.js";

/**
 * A small wrapper, not the Resend client used directly everywhere — this
 * is the actual port/adapter boundary. Swapping providers later means
 * rewriting this one file; nothing that calls sendEmail (or the two
 * template functions below) needs to change.
 */
const resend = new Resend(env.RESEND_API_KEY);

/**
 * Every email gets the same frame (ADR 0068): the FlowDesc mark and name on top, the message, and the copyright line. The mark is a PNG served by the
 * app itself (`apps/web/public/email-logo.png`, drawn at 2x for sharp screens), because email programs do not draw SVG. Inline styles and a table,
 * because that is what email programs support. The picture has no alt text on purpose: the name is written next to it.
 */
function withFrame(body: string): string {
  const logo = `${env.APP_URL}/email-logo.png`;
  return `<div style="max-width:520px;margin:0 auto;padding:24px 20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#222222">
<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>
<td style="padding:0"><img src="${logo}" width="44" height="44" alt="" style="display:block;border:0;border-radius:10px" /></td>
<td style="padding:0 0 0 12px;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1;color:#1a1a1a">Flow<span style="color:#0f766e">Desc</span></td>
</tr></table>
<div style="margin-top:22px">${body}</div>
<p style="margin:28px 0 0;padding-top:14px;border-top:1px solid #e5e5e5;font-size:12px;line-height:1.5;color:#777777">&copy; 2026 FlowDesc. All rights reserved.</p>
</div>`;
}

async function sendEmail(input: { to: string; subject: string; html: string }): Promise<void> {
  const { error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: input.to,
    subject: input.subject,
    html: withFrame(input.html),
  });

  if (error) {
    // A failed send is logged, not thrown — see the callers in
    // auth.service.ts for why (registration/reset-request shouldn't fail
    // just because the email provider had a bad moment).
    logger.error({ err: error, to: input.to }, "failed to send email");
  }
}

export async function sendVerificationEmail(to: string, token: string): Promise<void> {
  const link = `${env.APP_URL}/verify-email?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to,
    subject: "Verify your FlowDesc email",
    html: `<p>Confirm your email address to finish setting up your FlowDesc account.</p><p><a href="${link}">Verify email</a></p><p>This link expires in 24 hours.</p>`,
  });
}

export async function sendInvitationEmail(input: {
  to: string;
  token: string;
  organizationName: string;
  inviterName: string;
  role: string;
}): Promise<void> {
  const link = `${env.APP_URL}/invite?token=${encodeURIComponent(input.token)}`;
  await sendEmail({
    to: input.to,
    subject: `${input.inviterName} invited you to ${input.organizationName} on FlowDesc`,
    html: `<p>${escapeHtml(input.inviterName)} invited you to join <strong>${escapeHtml(input.organizationName)}</strong> on FlowDesc as ${escapeHtml(input.role)}.</p><p><a href="${link}">Accept the invitation</a></p><p>This link expires in 7 days. If you were not expecting this, you can ignore this email.</p>`,
  });
}

/** Names are typed by users and go into an HTML email, so they are escaped. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export async function sendEmailChangeConfirmationEmail(to: string, token: string): Promise<void> {
  const link = `${env.APP_URL}/confirm-email-change?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to,
    subject: "Confirm your new FlowDesc email",
    html: `<p>Someone asked to use this address for a FlowDesc account. If that was you, confirm it to finish the change:</p><p><a href="${link}">Confirm new email</a></p><p>This link expires in 24 hours. If it was not you, ignore this email: nothing changes.</p>`,
  });
}

/** Sent to the OLD address when a change is requested, so the owner of the account hears about it. */
export async function sendEmailChangeRequestedNotice(to: string, newEmail: string): Promise<void> {
  await sendEmail({
    to,
    subject: "A new email was requested for your FlowDesc account",
    html: `<p>A change of this account's email to <strong>${escapeHtml(newEmail)}</strong> was requested. It only takes effect when the link sent to that address is opened.</p><p>If you did not ask for this, change your password.</p>`,
  });
}

/** Sent to the OLD address when the change has happened. */
export async function sendEmailChangedNotice(to: string, newEmail: string): Promise<void> {
  await sendEmail({
    to,
    subject: "Your FlowDesc email was changed",
    html: `<p>The email of this FlowDesc account is now <strong>${escapeHtml(newEmail)}</strong>. This address no longer signs in.</p><p>If you did not do this, contact the owner of your organization.</p>`,
  });
}

export async function sendPasswordChangedNotice(to: string): Promise<void> {
  await sendEmail({
    to,
    subject: "Your FlowDesc password was changed",
    html: `<p>The password of this FlowDesc account was just changed, and other devices were signed out.</p><p>If it was not you, reset the password right away from the login page.</p>`,
  });
}

export async function sendPasswordResetEmail(to: string, token: string): Promise<void> {
  const link = `${env.APP_URL}/reset-password?token=${encodeURIComponent(token)}`;
  await sendEmail({
    to,
    subject: "Reset your FlowDesc password",
    html: `<p>Someone requested a password reset for this FlowDesc account. If that was you:</p><p><a href="${link}">Reset password</a></p><p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>`,
  });
}
