import { randomUUID } from "node:crypto";
import { inlineImageIds, MAX_INLINE_IMAGES, mentionedUserIds, type IssuePriority, type IssueStatus } from "@flowdesk/contracts";
import { AppError } from "../../shared/errors.js";
import { hasPermission, type Role } from "../../shared/permissions.js";
import {
  broadcastIssueChanged,
  broadcastIssueCommented,
  broadcastIssueDeleted,
  broadcastNotificationCreated,
} from "../../realtime/socket-server.js";
import { logger } from "../../lib/logger.js";
import * as storage from "../../lib/storage.js";
import * as issuesRepository from "./issues.repository.js";
import * as organizationsRepository from "../organizations/organizations.repository.js";
import { assertDemoHasRoomForIssue } from "../demo/demo.guard.js";

function broadcastNotifications(notifiedUserIds: string[]): void {
  for (const userId of notifiedUserIds) broadcastNotificationCreated(userId);
}

/**
 * Was a pure pass-through until Phase 6 slice 1 — this is where business
 * rules land once there are any, kept as a real layer from the start so
 * that doesn't mean threading logic into the controller or repository
 * later. create/update/move call broadcastIssueChanged() after the
 * repository call resolves (genuinely "after commit" — db.transaction()
 * has already resolved by then), and only on a real success: update/move
 * check the repository's own discriminated-union status first, since a
 * conflict/not_found never actually changed anything worth broadcasting.
 */
export async function listIssues(
  organizationId: string,
  projectId: string,
  options: {
    limit: number;
    cursor?: string;
    status?: IssueStatus;
    priority?: IssuePriority;
    due?: "overdue" | "none";
    today?: string;
    assignee?: string;
    labelIds?: string[];
    sort?: "created" | "priority";
    order: "asc" | "desc";
  },
) {
  const result = await issuesRepository.listByProject(organizationId, projectId, options);
  if (result.status !== "ok") return result;
  // The cards show each issue's labels: one more query for the whole page, not one per issue.
  const labelsByIssue = await issuesRepository.labelsForIssues(organizationId, result.items.map((item) => item.id));
  return { ...result, items: result.items.map((item) => ({ ...item, labels: labelsByIssue.get(item.id) ?? [] })) };
}

export async function getIssue(organizationId: string, projectId: string, issueId: string) {
  return issuesRepository.findById(organizationId, projectId, issueId);
}

export async function getIssueByNumber(organizationId: string, projectId: string, number: number) {
  return issuesRepository.findByNumber(organizationId, projectId, number);
}

export async function createIssue(input: {
  organizationId: string;
  projectId: string;
  title: string;
  description: string | null;
  reporterId: string;
}) {
  await assertDemoHasRoomForIssue(input.organizationId); // a demo copy is capped (ADR 0044)
  const pictures = await checkedDescriptionImages({
    projectId: input.projectId,
    issueId: null,
    actorId: input.reporterId,
    description: input.description,
    previousDescription: null,
  });
  const { issue, notifiedUserIds } = await issuesRepository.createWithNotified({
    ...input,
    mentionedUserIds: await mentionedMembers(input.organizationId, input.description ?? ""),
    inlineImageIds: pictures,
  });
  broadcastIssueChanged(input.projectId, issue.id);
  broadcastNotifications(notifiedUserIds);
  return issue;
}

/**
 * The pictures an issue description shows (`![name](attachment:<id>)`), checked (ADR 0063). The ids come from text the client sent, so each must be an
 * image file this description may use: one the description ALREADY showed (anyone editing may keep what is there) or the writer's own draft (of this
 * issue, or of this project when the issue is being created). Another person's file, an unknown id or a non-image is a 400 and nothing is saved. At
 * most 10. Returns the ids of the drafts that must be linked (the ones not already the issue's).
 */
async function checkedDescriptionImages(input: {
  projectId: string;
  issueId: string | null;
  actorId: string;
  description: string | null;
  previousDescription: string | null;
}): Promise<string[]> {
  const ids = inlineImageIds(input.description ?? "");
  if (ids.length === 0) return [];
  if (ids.length > MAX_INLINE_IMAGES) {
    throw new AppError("too_many_inline_images", 400, `A description can show at most ${MAX_INLINE_IMAGES} pictures.`);
  }
  const kept = inlineImageIds(input.previousDescription ?? "");
  const files = new Map((await issuesRepository.findFilesForDescription(input.projectId, input.issueId, ids)).map((file) => [file.id, file]));
  const toLink: string[] = [];
  for (const id of ids) {
    const file = files.get(id);
    const usable = file && ((kept.includes(id) && !file.draft) || (file.draft && file.uploaderId === input.actorId));
    if (!file || !usable || !INLINE_IMAGE_TYPES.includes(file.mimeType)) {
      throw new AppError("invalid_inline_image", 400, "A picture in this description is not one you uploaded for it.");
    }
    if (file.draft) toLink.push(id);
  }
  return toLink;
}

export async function updateIssue(input: {
  organizationId: string;
  projectId: string;
  issueId: string;
  expectedVersion: number;
  changes: Partial<{
    title: string;
    description: string | null;
    status: IssueStatus;
    priority: IssuePriority;
    dueDate: string | null;
    assigneeId: string | null;
  }>;
  actorId: string;
}) {
  // An assignee must belong to THIS organization. No foreign key can say so
  // (the link is through organization_members), and the id arrives from the
  // client, so it is checked here on every assignment. The member's name is kept
  // in the event payload: the timeline should say who it was then.
  let eventExtras: Record<string, unknown> | undefined;
  // A changed description: its pictures are checked and its newly @mentioned members found (ADR 0063). The previous text comes from a read here;
  // if someone changed the issue since, the version check in update() answers conflict and none of this is used.
  let inlineImages: string[] = [];
  let newMentionUserIds: string[] = [];
  if (input.changes.description !== undefined) {
    const current = await issuesRepository.findById(input.organizationId, input.projectId, input.issueId);
    if (current) {
      inlineImages = await checkedDescriptionImages({
        projectId: input.projectId,
        issueId: input.issueId,
        actorId: input.actorId,
        description: input.changes.description,
        previousDescription: current.description,
      });
      const before = mentionedUserIds(current.description ?? "");
      newMentionUserIds = (await mentionedMembers(input.organizationId, input.changes.description ?? "")).filter((id) => !before.includes(id));
    }
  }
  if (input.changes.assigneeId !== undefined) {
    if (input.changes.assigneeId === null) {
      eventExtras = { assigneeName: null };
    } else {
      const member = await organizationsRepository.findMember(input.organizationId, input.changes.assigneeId);
      if (!member) return { status: "invalid_assignee" } as const;
      eventExtras = { assigneeName: member.name };
    }
  }

  const result = await issuesRepository.update({ ...input, eventExtras, newMentionUserIds, inlineImageIds: inlineImages });
  if (result.status === "updated") {
    broadcastIssueChanged(input.projectId, input.issueId);
    broadcastNotifications(result.notifiedUserIds);
  }
  return result;
}

export async function listIssueLabels(organizationId: string, issueId: string) {
  return issuesRepository.listLabelsForIssue(organizationId, issueId);
}

// See the matching comment in labels.service.ts: this drizzle-orm version
// wraps the raw pg error in a DrizzleQueryError, code/constraint live on
// err.cause, not the top-level error.
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

export async function attachLabel(input: {
  organizationId: string;
  issueId: string;
  labelId: string;
  actorId: string;
}) {
  try {
    const result = await issuesRepository.attachLabel(input);
    if (result.status === "attached") broadcastNotifications(result.notifiedUserIds);
    return result;
  } catch (err) {
    if (isUniqueViolation(err, "issue_labels_issue_id_label_id_pk")) {
      throw new AppError("label_already_attached", 409, "This label is already attached to the issue.");
    }
    throw err;
  }
}

export async function detachLabel(input: {
  organizationId: string;
  issueId: string;
  labelId: string;
  actorId: string;
}) {
  const result = await issuesRepository.detachLabel(input);
  if (result.status === "detached") broadcastNotifications(result.notifiedUserIds);
  return result;
}

/**
 * The people a comment body @mentions who are CURRENT members of this organization (ADR 0033). The ids come from text the
 * client sent, so they are never trusted: a made-up id or a person in another organization is simply dropped (no
 * notification, and the comment still posts, its token just shows as text). The notification SQL does not check membership
 * itself, so this is the check.
 */
async function mentionedMembers(organizationId: string, body: string): Promise<string[]> {
  const found: string[] = [];
  for (const id of mentionedUserIds(body)) {
    if (await organizationsRepository.findMember(organizationId, id)) found.push(id);
  }
  return found;
}

/** What can be shown inside a comment's text (ADR 0062). SVG is not here: it can carry script. Other files keep "Attach files". */
const INLINE_IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

/**
 * The pictures a comment body shows (`![name](attachment:<id>)`), checked (ADR 0062). The ids come from text the client sent, so each must be a
 * real image file on THIS issue, uploaded by the person writing, and either still a draft or already on this very comment. Anything else
 * (another issue's file, someone else's draft, an unknown id, a PDF) is a 400 and nothing is saved. At most 10 pictures. Returns the ids.
 */
async function checkedInlineImages(input: {
  organizationId: string;
  issueId: string;
  uploaderId: string;
  commentId?: string;
  body: string;
}): Promise<string[]> {
  const ids = inlineImageIds(input.body);
  if (ids.length === 0) return ids;
  if (ids.length > MAX_INLINE_IMAGES) {
    throw new AppError("too_many_inline_images", 400, `A comment can show at most ${MAX_INLINE_IMAGES} pictures.`);
  }
  const files = new Map((await issuesRepository.findAttachmentsByIds(input.organizationId, input.issueId, ids)).map((file) => [file.id, file]));
  for (const id of ids) {
    const file = files.get(id);
    const usable = file && file.uploaderId === input.uploaderId && (file.draft || (input.commentId !== undefined && file.commentId === input.commentId));
    if (!file || !usable || !INLINE_IMAGE_TYPES.includes(file.mimeType)) {
      throw new AppError("invalid_inline_image", 400, "A picture in this comment is not one you uploaded for it.");
    }
  }
  return ids;
}

export async function addComment(input: { organizationId: string; issueId: string; authorId: string; body: string }) {
  const inlineImages = await checkedInlineImages({
    organizationId: input.organizationId,
    issueId: input.issueId,
    uploaderId: input.authorId,
    body: input.body,
  });
  const { comment, notifiedUserIds } = await issuesRepository.addComment({
    issueId: input.issueId,
    authorId: input.authorId,
    body: input.body,
    mentionedUserIds: await mentionedMembers(input.organizationId, input.body),
    inlineImageIds: inlineImages,
  });
  broadcastIssueCommented(input.issueId);
  broadcastNotifications(notifiedUserIds);
  return comment;
}

/**
 * The timeline as the viewer should see it. The repository returns raw rows
 * with each comment's CURRENT row joined on; this folds that into the
 * issue.commented events: the current text (edits applied), `edited`,
 * `deleted` (row gone: text blanked, the original never leaves the server),
 * and whether THIS viewer may edit or delete it, so the client needs no role
 * logic. Edit: the author. Delete: the author, or an owner/admin. Both need
 * manage_issue (a viewer who once wrote a comment can no longer change it).
 */
export async function listIssueEvents(
  organizationId: string,
  issueId: string,
  viewer: { userId: string; role: Role },
) {
  const rows = await issuesRepository.listEvents(organizationId, issueId);
  const canManage = hasPermission(viewer.role, "manage_issue");
  const isAdmin = viewer.role === "owner" || viewer.role === "admin";

  return rows.map((row) => {
    const {
      commentRowId,
      commentBody,
      commentCreatedAt,
      commentUpdatedAt,
      ...event
    } = row;
    if (event.type !== "issue.commented") return event;

    const deleted = commentRowId === null;
    const isAuthor = event.actorId === viewer.userId;
    return {
      ...event,
      payload: {
        // payload is free-form jsonb (unknown); issue.commented always carries commentId.
        commentId: (event.payload as { commentId?: string }).commentId,
        body: deleted ? "" : (commentBody ?? ""),
        edited: !deleted && commentUpdatedAt !== null && commentCreatedAt !== null && commentUpdatedAt > commentCreatedAt,
        deleted,
        canEdit: !deleted && canManage && isAuthor,
        canDelete: !deleted && canManage && (isAuthor || isAdmin),
      },
    };
  });
}

/**
 * Edit: the author only. The decision lives here, not in the repository
 * (which stays logic-free). Quiet by design: no notifications, but open issue
 * pages are told to refresh.
 */
export async function editComment(input: {
  organizationId: string;
  issueId: string;
  commentId: string;
  actorId: string;
  body: string;
}) {
  const comment = await issuesRepository.findComment(input.organizationId, input.issueId, input.commentId);
  if (!comment) return { status: "not_found" } as const;
  if (comment.authorId !== input.actorId) return { status: "forbidden" } as const;

  const inlineImages = await checkedInlineImages({
    organizationId: input.organizationId,
    issueId: input.issueId,
    uploaderId: input.actorId,
    commentId: input.commentId,
    body: input.body,
  });
  // Only people this edit ADDS are told: those mentioned now and not in the text it replaces (ADR 0033).
  const before = mentionedUserIds(comment.body);
  const newMentionUserIds = (await mentionedMembers(input.organizationId, input.body)).filter((id) => !before.includes(id));
  const { comment: updated, notifiedUserIds } = await issuesRepository.updateComment({
    issueId: input.issueId,
    commentId: input.commentId,
    actorId: input.actorId,
    body: input.body,
    newMentionUserIds,
    inlineImageIds: inlineImages,
  });
  broadcastIssueCommented(input.issueId);
  broadcastNotifications(notifiedUserIds);
  return { status: "edited", comment: updated } as const;
}

/** Delete: the author, or an owner/admin. Files on the comment are kept. */
export async function removeComment(input: {
  organizationId: string;
  issueId: string;
  commentId: string;
  actorId: string;
  actorRole: Role;
}) {
  const comment = await issuesRepository.findComment(input.organizationId, input.issueId, input.commentId);
  if (!comment) return { status: "not_found" } as const;
  const isAdmin = input.actorRole === "owner" || input.actorRole === "admin";
  if (comment.authorId !== input.actorId && !isAdmin) return { status: "forbidden" } as const;

  const deleted = await issuesRepository.deleteComment({
    issueId: input.issueId,
    commentId: input.commentId,
    actorId: input.actorId,
  });
  if (!deleted) return { status: "not_found" } as const;
  broadcastIssueCommented(input.issueId);
  return { status: "deleted" } as const;
}

/** Adds each issue's labels (one query for all of them) so a card can show its pills, like the issue list does. */
async function withLabels<T extends { id: string }>(organizationId: string, items: T[]) {
  const labelsByIssue = await issuesRepository.labelsForIssues(organizationId, items.map((item) => item.id));
  return items.map((item) => ({ ...item, labels: labelsByIssue.get(item.id) ?? [] }));
}

export async function getBoard(organizationId: string, projectId: string) {
  return withLabels(organizationId, await issuesRepository.listForBoard(organizationId, projectId));
}

export async function moveIssue(input: {
  organizationId: string;
  projectId: string;
  issueId: string;
  expectedVersion: number;
  status: IssueStatus;
  prevIssueId?: string;
  nextIssueId?: string;
  actorId: string;
}) {
  const result = await issuesRepository.move(input);
  if (result.status === "moved") {
    broadcastIssueChanged(input.projectId, input.issueId);
    broadcastNotifications(result.notifiedUserIds);
  }
  return result;
}

export async function getBacklog(organizationId: string, projectId: string) {
  const result = await issuesRepository.getBacklog(organizationId, projectId);
  return {
    ...result,
    backlog: await withLabels(organizationId, result.backlog),
    activeSprintIssues: await withLabels(organizationId, result.activeSprintIssues),
  };
}

export async function assignSprint(input: {
  organizationId: string;
  projectId: string;
  issueId: string;
  expectedVersion: number;
  sprintId: string | null;
  prevIssueId?: string;
  nextIssueId?: string;
  actorId: string;
}) {
  const result = await issuesRepository.assignSprint(input);
  if (result.status === "assigned") broadcastNotifications(result.notifiedUserIds);
  return result;
}

export async function searchIssues(organizationId: string, query: string, limit: number) {
  return issuesRepository.search(organizationId, query, limit);
}

export async function listAttachments(organizationId: string, issueId: string) {
  return issuesRepository.listAttachmentsForIssue(organizationId, issueId);
}

/**
 * The id is generated here, not left to the DB — lib/storage.ts's flat
 * {attachmentId} filenames mean the file needs a name before it's
 * written to disk, and the disk write needs to happen (and succeed)
 * before the DB row is created, so a failed upload never leaves a
 * dangling row pointing at a file that was never saved. See the Phase
 * 7 slice 4 plan.
 */
export async function uploadAttachment(input: {
  organizationId: string;
  issueId: string;
  uploaderId: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
  /** Attach the file to this comment (must be the uploader's own, on this issue). */
  commentId?: string;
  /** A picture pasted into a comment box, not posted yet (ADR 0062). Images only; never together with a commentId. */
  draft?: boolean;
}) {
  storage.assertUploadsEnabled();
  if (input.draft && !INLINE_IMAGE_TYPES.includes(input.mimeType)) return { status: "draft_not_image" } as const;
  if (input.draft) await removeExpiredDrafts();
  // Validated BEFORE anything is written to disk, so a rejected comment id
  // never leaves an orphan file behind.
  if (input.commentId) {
    const comment = await issuesRepository.findComment(input.organizationId, input.issueId, input.commentId);
    if (!comment) return { status: "comment_not_found" } as const;
    if (comment.authorId !== input.uploaderId) return { status: "comment_forbidden" } as const;
  }

  const id = randomUUID();
  const storageKey = await storage.saveFile(id, input.buffer);

  const { attachment, notifiedUserIds } = await issuesRepository.addAttachment({
    id,
    issueId: input.issueId,
    uploaderId: input.uploaderId,
    filename: input.filename,
    mimeType: input.mimeType,
    sizeBytes: input.buffer.length,
    storageKey,
    commentId: input.commentId ?? null,
    draft: input.draft,
  });

  broadcastNotifications(notifiedUserIds);
  // A comment's file arrives after the comment itself: tell open pages to
  // refetch so it shows up without a reload.
  if (input.commentId) broadcastIssueCommented(input.issueId);
  return { status: "uploaded", attachment } as const;
}

/**
 * A picture pasted into the New issue popup (ADR 0063): saved as a draft of the project, since the issue does not exist yet. Images only. Silent: no
 * event, no notification. Creating the issue links it; one never used is deleted after 24 hours with the other drafts.
 */
export async function uploadProjectDraftImage(input: {
  projectId: string;
  uploaderId: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
}) {
  storage.assertUploadsEnabled();
  if (!INLINE_IMAGE_TYPES.includes(input.mimeType)) return { status: "not_image" } as const;
  await removeExpiredDrafts();
  const id = randomUUID();
  const storageKey = await storage.saveFile(id, input.buffer);
  const attachment = await issuesRepository.addProjectDraft({
    id,
    projectId: input.projectId,
    uploaderId: input.uploaderId,
    filename: input.filename,
    mimeType: input.mimeType,
    sizeBytes: input.buffer.length,
    storageKey,
  });
  return { status: "uploaded", attachment } as const;
}

/** Drafts nobody posted within this long are deleted (ADR 0062). */
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes drafts older than 24 hours, rows and files. Runs on the next draft upload (there is no job runner yet), like the demo cleanup. A failure
 * is logged and never fails the upload that happened to trigger it.
 */
async function removeExpiredDrafts(): Promise<void> {
  try {
    const storageKeys = await issuesRepository.deleteExpiredDrafts(new Date(Date.now() - DRAFT_MAX_AGE_MS));
    for (const storageKey of storageKeys) await storage.deleteFile(storageKey);
  } catch (error) {
    logger.warn({ err: error }, "Could not delete expired draft pictures");
  }
}

export async function deleteAttachment(input: {
  organizationId: string;
  issueId: string;
  attachmentId: string;
  actorId: string;
}) {
  const result = await issuesRepository.deleteAttachment(input);
  if (result.status === "deleted") {
    broadcastNotifications(result.notifiedUserIds);
    await storage.deleteFile(result.storageKey);
  }
  return result;
}

export async function getAttachmentForDownload(attachmentId: string) {
  return issuesRepository.findAttachmentForDownload(attachmentId);
}

/**
 * Delete an issue: the reporter, or an owner/admin (mirrors comments). The
 * permission middleware in front is only the floor (manage_issue); who reported
 * it is a decision made here against the real row. After the database has
 * committed: the uploaded files are removed from disk (best effort, logged),
 * open pages are sent away, and everyone who had notifications for it refetches
 * their bell (those notifications went with the issue).
 */
export async function deleteIssue(input: {
  organizationId: string;
  projectId: string;
  issueId: string;
  actorId: string;
  actorRole: Role;
}) {
  const issue = await issuesRepository.findById(input.organizationId, input.projectId, input.issueId);
  if (!issue) return { status: "not_found" } as const;
  const isAdmin = input.actorRole === "owner" || input.actorRole === "admin";
  if (issue.reporterId !== input.actorId && !isAdmin) return { status: "forbidden" } as const;

  const result = await issuesRepository.deleteIssue(input);
  if (result.status === "not_found") return result;

  for (const storageKey of result.storageKeys) {
    await storage.deleteFile(storageKey);
  }
  broadcastIssueDeleted(input.projectId, input.issueId);
  // The event name says "created" but the client's reaction is simply to
  // refetch its notification list and unread count, which is what is needed.
  for (const userId of result.affectedUserIds) broadcastNotificationCreated(userId);
  return { status: "deleted" } as const;
}
