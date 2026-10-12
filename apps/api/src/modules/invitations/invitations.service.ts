import argon2 from "argon2";
import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors.js";
import { sendInvitationEmail } from "../../lib/email.js";
import { broadcastOrganizationChanged } from "../../realtime/socket-server.js";
import { generateOpaqueToken, hashToken } from "../auth/tokens.js";
import * as authRepository from "../auth/auth.repository.js";
import * as organizationsRepository from "../organizations/organizations.repository.js";
import * as invitationsRepository from "./invitations.repository.js";

const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

type InvitableRole = "admin" | "member" | "viewer";

// One message for every way a link can be unusable (unknown, used, revoked,
// expired): the person only needs to know to ask for a new one, and distinct
// messages would tell a stranger which tokens once existed.
const INVALID_INVITATION_ERROR = () =>
  new AppError("invalid_invitation", 400, "This invitation is invalid or has expired.");

// code and constraint live on err.cause (drizzle wraps the driver error), not on the
// top-level error; same helper shape as labels.service.ts.
function isUniqueViolation(err: unknown, constraint: string): boolean {
  const cause =
    typeof err === "object" && err !== null ? (err as { cause?: unknown }).cause : undefined;
  return (
    typeof cause === "object" &&
    cause !== null &&
    (cause as { code?: unknown }).code === "23505" &&
    (cause as { constraint?: unknown }).constraint === constraint
  );
}

function toInvitationDto(row: {
  id: string;
  email: string;
  role: string;
  invitedByName: string;
  createdAt: Date;
  expiresAt: Date;
}) {
  return {
    id: row.id,
    email: row.email,
    role: row.role as InvitableRole,
    invitedByName: row.invitedByName,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    expired: row.expiresAt.getTime() < Date.now(),
  };
}

export async function listInvitations(organizationId: string) {
  const rows = await invitationsRepository.listOpen(organizationId);
  return rows.map(toInvitationDto);
}

export async function createInvitation(input: {
  organizationId: string;
  actorId: string;
  email: string;
  role: InvitableRole;
}) {
  const email = input.email.toLowerCase().trim();

  // The app supports one organization per user (ADR 0024), so an email can be invited
  // only if it has no account at all, or an account that belongs to no organization (a
  // removed member being invited back). Saying so plainly is fine here; the caller is an
  // owner or admin of this organization, not an anonymous visitor.
  const existingUser = await authRepository.findUserByEmail(email);
  if (existingUser) {
    const membership = await organizationsRepository.findMembership(existingUser.id, input.organizationId);
    if (membership) {
      throw new AppError("already_member", 409, "This person is already a member of the organization.");
    }
    const otherOrganization = await organizationsRepository.findPrimaryOrganizationForUser(existingUser.id);
    if (otherOrganization) {
      throw new AppError(
        "email_has_account",
        409,
        "This email already has a FlowDesc account in another organization. Inviting people who already belong to an organization is not supported yet.",
      );
    }
  }

  const token = generateOpaqueToken();
  let created;
  try {
    created = await invitationsRepository.create({
      organizationId: input.organizationId,
      email,
      role: input.role,
      tokenHash: hashToken(token),
      invitedBy: input.actorId,
      expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
    });
  } catch (err) {
    if (isUniqueViolation(err, "invitations_one_open_per_email")) {
      throw new AppError("invitation_pending", 409, "This email has already been invited. Revoke that invitation to send a new one.");
    }
    throw err;
  }

  return deliverInvitation({ created, token, organizationId: input.organizationId, actorId: input.actorId });
}

/**
 * The part shared by a new invitation and a re-send: email the link, tell open tabs, and
 * hand the link back to the inviter. Not part of the database work on purpose, like the
 * verification email: a flaky email provider must not be the reason an invitation cannot be
 * created, and the inviter always gets the link back to share by hand.
 */
async function deliverInvitation(input: {
  created: { id: string; email: string; role: string; createdAt: Date; expiresAt: Date };
  token: string;
  organizationId: string;
  actorId: string;
}) {
  const [organization, inviter] = await Promise.all([
    organizationsRepository.findOrganizationById(input.organizationId),
    authRepository.findUserById(input.actorId),
  ]);
  const inviterName = inviter?.name ?? "Someone";

  await sendInvitationEmail({
    to: input.created.email,
    token: input.token,
    organizationName: organization?.name ?? "FlowDesc",
    inviterName,
    role: input.created.role,
  });

  broadcastOrganizationChanged(input.organizationId, { kind: "members" });

  return {
    data: toInvitationDto({ ...input.created, invitedByName: inviterName }),
    inviteUrl: `${env.APP_URL}/invite?token=${encodeURIComponent(input.token)}`,
  };
}

export async function resendInvitation(input: { organizationId: string; actorId: string; invitationId: string }) {
  const token = generateOpaqueToken();
  const created = await invitationsRepository.resend({
    organizationId: input.organizationId,
    invitationId: input.invitationId,
    tokenHash: hashToken(token),
    invitedBy: input.actorId,
    expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
  });
  if (!created) {
    throw new AppError("invitation_not_found", 404, "Invitation not found.");
  }
  return deliverInvitation({ created, token, organizationId: input.organizationId, actorId: input.actorId });
}

export async function revokeInvitation(organizationId: string, invitationId: string, actorId: string) {
  const revoked = await invitationsRepository.revoke(organizationId, invitationId, actorId);
  if (!revoked) {
    throw new AppError("invitation_not_found", 404, "Invitation not found.");
  }
  broadcastOrganizationChanged(organizationId, { kind: "members" });
}

async function findUsableInvitation(token: string) {
  const invitation = await invitationsRepository.findByTokenHash(hashToken(token));
  if (
    !invitation ||
    invitation.acceptedAt ||
    invitation.revokedAt ||
    invitation.expiresAt.getTime() < Date.now()
  ) {
    throw INVALID_INVITATION_ERROR();
  }
  return invitation;
}

/** The email's account if it has one, and whether it is free to join (no organization yet). */
async function accountStateFor(email: string) {
  const user = await authRepository.findUserByEmail(email);
  if (!user) return { user: undefined, free: false };
  const organization = await organizationsRepository.findPrimaryOrganizationForUser(user.id);
  return { user, free: organization === undefined };
}

export async function previewInvitation(token: string) {
  const invitation = await findUsableInvitation(token);
  const account = await accountStateFor(invitation.email);
  return {
    hasAccount: account.free,
    organizationName: invitation.organizationName,
    inviterName: invitation.inviterName,
    email: invitation.email,
    role: invitation.role as InvitableRole,
  };
}

export async function acceptInvitation(input: { token: string; name?: string; password?: string }) {
  const invitation = await findUsableInvitation(input.token);
  const account = await accountStateFor(invitation.email);

  let result;
  if (account.user) {
    // An account exists. Only one without an organization may join (the app is one
    // organization per user); the person proves nothing more than holding the emailed link,
    // exactly like a verification link, and gains only the invited membership.
    if (!account.free) {
      throw new AppError("email_already_registered", 409, "An account with this email already exists.");
    }
    result = await invitationsRepository.acceptForExistingUser({
      invitationId: invitation.id,
      organizationId: invitation.organizationId,
      role: invitation.role as InvitableRole,
      userId: account.user.id,
    });
  } else {
    const missing: Record<string, string[]> = {};
    if (!input.name) missing.name = ["Name is required"];
    if (!input.password) missing.password = ["Password must be at least 8 characters"];
    if (!input.name || !input.password) {
      throw new AppError("validation_error", 400, "Invalid details", missing);
    }
    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    try {
      result = await invitationsRepository.accept({
        invitationId: invitation.id,
        organizationId: invitation.organizationId,
        role: invitation.role as InvitableRole,
        email: invitation.email,
        name: input.name,
        passwordHash,
      });
    } catch (err) {
      // The email got an account between the invitation and now. The transaction
      // rolled back, so the invitation is still open.
      if (isUniqueViolation(err, "users_email_unique")) {
        throw new AppError("email_already_registered", 409, "An account with this email already exists.");
      }
      throw err;
    }
  }
  if (!result) {
    // Lost a race with another accept or a revoke.
    throw INVALID_INVITATION_ERROR();
  }

  broadcastOrganizationChanged(invitation.organizationId, { kind: "members" });
  return result;
}
