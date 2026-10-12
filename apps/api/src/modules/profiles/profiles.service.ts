import { randomBytes } from "node:crypto";
import type { z } from "zod";
import type { updateProfileRequestSchema } from "@flowdesc/contracts";
import { processAvatar } from "../../lib/image.js";
import { avatarStorageKey, avatarUrlFor } from "../../lib/avatar-url.js";
import { assertUploadsEnabled, deleteFile, saveFile } from "../../lib/storage.js";
import { broadcastOrganizationChanged } from "../../realtime/socket-server.js";
import { AppError } from "../../shared/errors.js";
import * as profilesRepository from "./profiles.repository.js";

type ParsedProfileInput = z.output<typeof updateProfileRequestSchema>;

/** Everyone who shares an organization with this person should refetch their lists. */
async function tellOrganizations(userId: string): Promise<void> {
  const organizationIds = await profilesRepository.listOrganizationIdsOfUser(userId);
  for (const organizationId of organizationIds) {
    broadcastOrganizationChanged(organizationId, { kind: "members" });
  }
}

export async function updateMyProfile(userId: string, input: ParsedProfileInput): Promise<void> {
  await profilesRepository.updateProfile(userId, input);
  await tellOrganizations(userId);
}

/**
 * Order matters: the new file is written BEFORE the row points at it (a crash in between leaves
 * an unused file, never a row pointing at nothing), and the old file is deleted AFTER the swap.
 */
export async function setMyAvatar(userId: string, upload: Buffer): Promise<string> {
  assertUploadsEnabled();
  const picture = await processAvatar(upload);
  const key = randomBytes(16).toString("hex");
  await saveFile(avatarStorageKey(key), picture);
  const previous = await profilesRepository.swapAvatarKey(userId, key);
  if (previous) await deleteFile(avatarStorageKey(previous));
  await tellOrganizations(userId);
  return avatarUrlFor(key)!;
}

export async function removeMyAvatar(userId: string): Promise<void> {
  const previous = await profilesRepository.swapAvatarKey(userId, null);
  if (previous) await deleteFile(avatarStorageKey(previous));
  await tellOrganizations(userId);
}

export async function getProfile(organizationId: string, userId: string) {
  const profile = await profilesRepository.findProfile(organizationId, userId);
  if (!profile) throw new AppError("profile_not_found", 404, "That person was not found in this organization.");
  return {
    userId: profile.userId,
    name: profile.name,
    email: profile.email,
    jobTitle: profile.jobTitle,
    bio: profile.bio,
    avatarUrl: avatarUrlFor(profile.avatarKey),
    role: profile.role,
    joinedAt: profile.joinedAt.toISOString(),
  };
}

/**
 * The event payload is trimmed before it leaves: a comment's text and a description's full text
 * are not needed to write "commented on WEB-4", and a deleted comment's original text stays in
 * its stored event (ADR 0019), so it must never be served from here.
 */
function publicPayload(type: string, payload: Record<string, unknown>): Record<string, unknown> {
  switch (type) {
    case "issue.commented":
    case "issue.comment_edited":
    case "issue.comment_deleted":
      return {};
    case "issue.updated": {
      const kept: Record<string, unknown> = {};
      for (const key of ["title", "status", "priority", "dueDate", "assigneeId", "assigneeName"]) {
        if (key in payload) kept[key] = payload[key];
      }
      if ("description" in payload) kept.description = true;
      return kept;
    }
    default:
      return payload;
  }
}

export async function getActivity(
  organizationId: string,
  userId: string,
  options: { limit: number; cursor?: string },
) {
  // 404 for someone who is not in this organization, same as the profile itself.
  await getProfile(organizationId, userId);
  const result = await profilesRepository.listActivity(organizationId, userId, options);
  if (result.status === "invalid_cursor") throw new AppError("invalid_cursor", 400, "Invalid pagination cursor.");
  return {
    data: result.items.map((row) => ({
      id: row.id,
      type: row.type,
      payload: publicPayload(row.type, row.payload as Record<string, unknown>),
      createdAt: row.createdAt.toISOString(),
      issueId: row.issueId,
      issueKey: `${row.projectKey}-${row.issueNumber}`,
      issueTitle: row.issueTitle,
      projectId: row.projectId,
    })),
    nextCursor: result.nextCursor,
  };
}

export async function openAvatar(key: string): Promise<string> {
  if (!/^[a-f0-9]{32}$/.test(key)) throw new AppError("avatar_not_found", 404, "Not found.");
  const owner = await profilesRepository.findUserIdByAvatarKey(key);
  if (!owner) throw new AppError("avatar_not_found", 404, "Not found.");
  return avatarStorageKey(key);
}

/**
 * Show the card only to someone whose profile is still bare (no photo, no job title, no bio) and
 * who has not pressed "Not now". It disappears by itself once any of the three is filled in; it
 * comes back if they are all cleared again, unless they dismissed it.
 */
export async function shouldShowNudge(userId: string): Promise<boolean> {
  const state = await profilesRepository.findNudgeState(userId);
  if (!state || state.dismissedAt) return false;
  return !state.avatarKey && !state.jobTitle && !state.bio;
}

/** True for someone whose account has never had the guided tour started on its own (a person who signed up after the tour feature). */
export async function isTourPending(userId: string): Promise<boolean> {
  return (await profilesRepository.findTourSeenAt(userId)) === null;
}

export async function markTourSeen(userId: string): Promise<void> {
  await profilesRepository.markTourSeen(userId);
}

export async function dismissNudge(userId: string): Promise<void> {
  await profilesRepository.dismissNudge(userId);
}
