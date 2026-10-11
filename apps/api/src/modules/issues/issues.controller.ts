import type { Request, Response } from "express";
import { z } from "zod";
import {
  assignIssueSprintRequestSchema,
  attachLabelRequestSchema,
  attachmentResponseSchema,
  createCommentRequestSchema,
  createCommentResponseSchema,
  createIssueRequestSchema,
  createIssueResponseSchema,
  getBacklogResponseSchema,
  getBoardResponseSchema,
  getIssueResponseSchema,
  listAttachmentsResponseSchema,
  listIssueEventsResponseSchema,
  listIssuesQuerySchema,
  listIssuesResponseSchema,
  listLabelsResponseSchema,
  moveIssueRequestSchema,
  searchIssuesQuerySchema,
  searchIssuesResponseSchema,
  updateCommentRequestSchema,
  updateCommentResponseSchema,
  updateIssueRequestSchema,
  updateIssueResponseSchema,
} from "@flowdesk/contracts";
import { AppError } from "../../shared/errors.js";
import * as storage from "../../lib/storage.js";
import { parseRange } from "../../lib/http-range.js";
import * as issuesService from "./issues.service.js";

// Same Date -> ISO string conversion projects.controller.ts does — Drizzle
// returns Date objects, the wire format is ISO strings (see contracts).
function toWireFormat(row: { createdAt: Date; updatedAt: Date; [key: string]: unknown }) {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

// issue_events has no updatedAt (append-only, never modified) — a
// separate helper rather than making toWireFormat's updatedAt optional
// and having every other caller need to handle that case too.
function eventToWireFormat(row: { createdAt: Date; [key: string]: unknown }) {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

// downloadUrl is computed here, not stored — a fresh signed token on
// every response, same "controllers format the response" job
// toWireFormat does, just also building a URL instead of only
// ISO-stringing dates. See lib/storage.ts's signDownloadToken.
function toAttachmentWireFormat(row: { id: string; createdAt: Date; [key: string]: unknown }) {
  const { expires, signature } = storage.signDownloadToken(row.id);
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    downloadUrl: `/api/v1/attachments/${row.id}/download?expires=${expires}&sig=${signature}`,
  };
}

export async function listIssues(req: Request, res: Response) {
  if (!req.ctx?.projectId) {
    throw new Error("listIssues requires requireProject to have run first");
  }

  const parsedQuery = listIssuesQuerySchema.safeParse(req.query);
  if (!parsedQuery.success) {
    throw new AppError(
      "validation_error",
      400,
      "Invalid pagination parameters",
      parsedQuery.error.flatten().fieldErrors,
    );
  }

  const { label: labelIds, ...rest } = parsedQuery.data;
  const result = await issuesService.listIssues(req.ctx.organizationId, req.ctx.projectId, { ...rest, labelIds });

  if (result.status === "invalid_cursor") {
    throw new AppError("invalid_cursor", 400, "Invalid pagination cursor.");
  }

  const body = listIssuesResponseSchema.parse({
    data: result.items.map((item) => ({ ...toWireFormat(item), labels: item.labels })),
    nextCursor: result.nextCursor,
  });
  res.json(body);
}

export async function getIssue(req: Request, res: Response) {
  if (!req.ctx?.projectId || !req.ctx.issueId) {
    throw new Error("getIssue requires requireIssue to have run first");
  }

  const issue = await issuesService.getIssue(req.ctx.organizationId, req.ctx.projectId, req.ctx.issueId);
  if (!issue) {
    throw new AppError("issue_not_found", 404, "Issue not found.");
  }

  const body = getIssueResponseSchema.parse({ data: toWireFormat(issue) });
  res.json(body);
}

/**
 * The same issue as getIssue, found by its per-project number (ADR 0030): this is how a readable address
 * (/projects/WEB/issues/WEB-12) becomes an issue. A number that is not a positive whole number, or does not fit
 * the database column, is simply "not found" (404), never a 500.
 */
export async function getIssueByNumber(req: Request, res: Response) {
  if (!req.ctx?.projectId) {
    throw new Error("getIssueByNumber requires requireProject to have run first");
  }
  const raw = String(req.params.number);
  const number = /^[0-9]{1,9}$/.test(raw) ? Number(raw) : 0;
  const issue = number > 0 ? await issuesService.getIssueByNumber(req.ctx.organizationId, req.ctx.projectId, number) : undefined;
  if (!issue) {
    throw new AppError("issue_not_found", 404, "Issue not found.");
  }
  res.json(getIssueResponseSchema.parse({ data: toWireFormat(issue) }));
}

export async function createIssue(req: Request, res: Response) {
  if (!req.ctx?.projectId) {
    throw new Error("createIssue requires requireProject to have run first");
  }

  const parsed = createIssueRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(
      "validation_error",
      400,
      "Invalid issue details",
      parsed.error.flatten().fieldErrors,
    );
  }

  const issue = await issuesService.createIssue({
    organizationId: req.ctx.organizationId,
    projectId: req.ctx.projectId,
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    reporterId: req.ctx.userId,
  });

  const body = createIssueResponseSchema.parse({ data: toWireFormat(issue) });
  res.status(201).json(body);
}

export async function updateIssue(req: Request, res: Response) {
  if (!req.ctx?.projectId || !req.ctx.issueId) {
    throw new Error("updateIssue requires requireIssue to have run first");
  }

  const parsed = updateIssueRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(
      "validation_error",
      400,
      "Invalid issue update",
      parsed.error.flatten().fieldErrors,
    );
  }

  const { version, ...changes } = parsed.data;
  const result = await issuesService.updateIssue({
    organizationId: req.ctx.organizationId,
    projectId: req.ctx.projectId,
    issueId: req.ctx.issueId,
    expectedVersion: version,
    changes,
    actorId: req.ctx.userId,
  });

  if (result.status === "invalid_assignee") {
    throw new AppError("invalid_assignee", 400, "That person is not a member of this organization.");
  }

  if (result.status === "conflict") {
    throw new AppError(
      "version_conflict",
      409,
      "This issue was changed by someone else since you loaded it.",
      undefined,
      { current: toWireFormat(result.current) },
    );
  }

  if (result.status === "not_found") {
    throw new AppError("issue_not_found", 404, "Issue not found.");
  }

  const body = updateIssueResponseSchema.parse({ data: toWireFormat(result.issue) });
  res.json(body);
}

export async function moveIssue(req: Request, res: Response) {
  if (!req.ctx?.projectId || !req.ctx.issueId) {
    throw new Error("moveIssue requires requireIssue to have run first");
  }

  const parsed = moveIssueRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError("validation_error", 400, "Invalid move request", parsed.error.flatten().fieldErrors);
  }

  const result = await issuesService.moveIssue({
    organizationId: req.ctx.organizationId,
    projectId: req.ctx.projectId,
    issueId: req.ctx.issueId,
    expectedVersion: parsed.data.version,
    status: parsed.data.status,
    prevIssueId: parsed.data.prevIssueId,
    nextIssueId: parsed.data.nextIssueId,
    actorId: req.ctx.userId,
  });

  if (result.status === "invalid_neighbor") {
    throw new AppError("invalid_neighbor", 400, "One of the given neighbor issues isn't in that column.");
  }

  if (result.status === "conflict") {
    throw new AppError(
      "version_conflict",
      409,
      "This issue was changed by someone else since you loaded it.",
      undefined,
      { current: toWireFormat(result.current) },
    );
  }

  if (result.status === "not_found") {
    throw new AppError("issue_not_found", 404, "Issue not found.");
  }

  const body = updateIssueResponseSchema.parse({ data: toWireFormat(result.issue) });
  res.json(body);
}

export async function listIssueLabels(req: Request, res: Response) {
  if (!req.ctx?.issueId) {
    throw new Error("listIssueLabels requires requireIssue to have run first");
  }

  const rows = await issuesService.listIssueLabels(req.ctx.organizationId, req.ctx.issueId);
  const body = listLabelsResponseSchema.parse({ data: rows.map(toWireFormat) });
  res.json(body);
}

export async function createComment(req: Request, res: Response) {
  if (!req.ctx?.issueId) {
    throw new Error("createComment requires requireIssue to have run first");
  }

  const parsed = createCommentRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(
      "validation_error",
      400,
      "Invalid comment",
      parsed.error.flatten().fieldErrors,
    );
  }

  const comment = await issuesService.addComment({
    organizationId: req.ctx.organizationId,
    issueId: req.ctx.issueId,
    authorId: req.ctx.userId,
    body: parsed.data.body,
  });

  const body = createCommentResponseSchema.parse({ data: toWireFormat(comment) });
  res.status(201).json(body);
}

export async function listIssueEvents(req: Request, res: Response) {
  if (!req.ctx?.issueId) {
    throw new Error("listIssueEvents requires requireIssue to have run first");
  }

  const rows = await issuesService.listIssueEvents(req.ctx.organizationId, req.ctx.issueId, {
    userId: req.ctx.userId,
    role: req.ctx.role,
  });
  const body = listIssueEventsResponseSchema.parse({ data: rows.map(eventToWireFormat) });
  res.json(body);
}

function parseCommentId(req: Request): string {
  const parsed = z.uuid().safeParse(req.params.commentId);
  if (!parsed.success) {
    throw new AppError("invalid_comment_id", 400, "commentId must be a UUID.");
  }
  return parsed.data;
}

export async function updateComment(req: Request, res: Response) {
  if (!req.ctx?.issueId) {
    throw new Error("updateComment requires requireIssue to have run first");
  }
  const commentId = parseCommentId(req);

  const parsed = updateCommentRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError("validation_error", 400, "Invalid comment", parsed.error.flatten().fieldErrors);
  }

  const result = await issuesService.editComment({
    organizationId: req.ctx.organizationId,
    issueId: req.ctx.issueId,
    commentId,
    actorId: req.ctx.userId,
    body: parsed.data.body,
  });
  if (result.status === "not_found") throw new AppError("comment_not_found", 404, "Comment not found.");
  if (result.status === "forbidden") {
    throw new AppError("comment_forbidden", 403, "You can only edit your own comments.");
  }

  res.json(updateCommentResponseSchema.parse({ data: toWireFormat(result.comment) }));
}

export async function deleteComment(req: Request, res: Response) {
  if (!req.ctx?.issueId) {
    throw new Error("deleteComment requires requireIssue to have run first");
  }
  const commentId = parseCommentId(req);

  const result = await issuesService.removeComment({
    organizationId: req.ctx.organizationId,
    issueId: req.ctx.issueId,
    commentId,
    actorId: req.ctx.userId,
    actorRole: req.ctx.role,
  });
  if (result.status === "not_found") throw new AppError("comment_not_found", 404, "Comment not found.");
  if (result.status === "forbidden") {
    throw new AppError("comment_forbidden", 403, "You can only delete your own comments.");
  }

  res.status(204).end();
}

export async function getBoard(req: Request, res: Response) {
  if (!req.ctx?.projectId) {
    throw new Error("getBoard requires requireProject to have run first");
  }

  const rows = await issuesService.getBoard(req.ctx.organizationId, req.ctx.projectId);
  // getBoardResponseSchema reuses issueSchema, which has no boardRank
  // field — .parse() strips it (Zod's default for unrecognized keys),
  // which is exactly the point: rank never leaves the server. See ADR
  // 0007 / the Phase 5 slice 1 plan's "Decisions" section.
  const body = getBoardResponseSchema.parse({ data: rows.map(toWireFormat) });
  res.json(body);
}

export async function getBacklog(req: Request, res: Response) {
  if (!req.ctx?.projectId) {
    throw new Error("getBacklog requires requireProject to have run first");
  }

  const result = await issuesService.getBacklog(req.ctx.organizationId, req.ctx.projectId);
  const body = getBacklogResponseSchema.parse({
    activeSprint: result.activeSprint ? toWireFormat(result.activeSprint) : null,
    backlog: result.backlog.map(toWireFormat),
    activeSprintIssues: result.activeSprintIssues.map(toWireFormat),
  });
  res.json(body);
}

export async function assignIssueSprint(req: Request, res: Response) {
  if (!req.ctx?.projectId || !req.ctx.issueId) {
    throw new Error("assignIssueSprint requires requireIssue to have run first");
  }

  const parsed = assignIssueSprintRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError("validation_error", 400, "Invalid sprint assignment", parsed.error.flatten().fieldErrors);
  }

  const result = await issuesService.assignSprint({
    organizationId: req.ctx.organizationId,
    projectId: req.ctx.projectId,
    issueId: req.ctx.issueId,
    expectedVersion: parsed.data.version,
    sprintId: parsed.data.sprintId,
    prevIssueId: parsed.data.prevIssueId,
    nextIssueId: parsed.data.nextIssueId,
    actorId: req.ctx.userId,
  });

  if (result.status === "invalid_neighbor") {
    throw new AppError("invalid_neighbor", 400, "One of the given neighbor issues isn't in that list.");
  }

  if (result.status === "invalid_sprint") {
    throw new AppError("invalid_sprint", 400, "That sprint doesn't belong to this project.");
  }

  if (result.status === "conflict") {
    throw new AppError(
      "version_conflict",
      409,
      "This issue was changed by someone else since you loaded it.",
      undefined,
      { current: toWireFormat(result.current) },
    );
  }

  if (result.status === "not_found") {
    throw new AppError("issue_not_found", 404, "Issue not found.");
  }

  const body = updateIssueResponseSchema.parse({ data: toWireFormat(result.issue) });
  res.json(body);
}

export async function attachLabel(req: Request, res: Response) {
  if (!req.ctx?.issueId) {
    throw new Error("attachLabel requires requireIssue to have run first");
  }

  const parsed = attachLabelRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(
      "validation_error",
      400,
      "Invalid label attachment",
      parsed.error.flatten().fieldErrors,
    );
  }

  const result = await issuesService.attachLabel({
    organizationId: req.ctx.organizationId,
    issueId: req.ctx.issueId,
    labelId: parsed.data.labelId,
    actorId: req.ctx.userId,
  });

  if (result.status === "label_not_found") {
    throw new AppError("label_not_found", 404, "Label not found.");
  }

  const rows = await issuesService.listIssueLabels(req.ctx.organizationId, req.ctx.issueId);
  const body = listLabelsResponseSchema.parse({ data: rows.map(toWireFormat) });
  res.status(201).json(body);
}

// Org-scoped (requireOrgMembership only, no requireProject/requireIssue) —
// see the Phase 7 slice 1 plan's "Decisions": a command palette needs to
// search across the whole org, not one project. Fixed result cap, no
// pagination — a relevance-ranked result set degrades fast past page one.
const SEARCH_RESULT_LIMIT = 25;

export async function search(req: Request, res: Response) {
  if (!req.ctx) {
    throw new Error("search requires requireOrgMembership to have run first");
  }

  const parsed = searchIssuesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("validation_error", 400, "Invalid search query", parsed.error.flatten().fieldErrors);
  }

  const rows = await issuesService.searchIssues(req.ctx.organizationId, parsed.data.q, SEARCH_RESULT_LIMIT);
  const body = searchIssuesResponseSchema.parse({ data: rows.map(toWireFormat) });
  res.json(body);
}

export async function detachLabel(req: Request, res: Response) {
  if (!req.ctx?.issueId) {
    throw new Error("detachLabel requires requireIssue to have run first");
  }

  const parsedLabelId = z.uuid().safeParse(req.params.labelId);
  if (!parsedLabelId.success) {
    throw new AppError("invalid_label_id", 400, "labelId must be a UUID.");
  }

  const result = await issuesService.detachLabel({
    organizationId: req.ctx.organizationId,
    issueId: req.ctx.issueId,
    labelId: parsedLabelId.data,
    actorId: req.ctx.userId,
  });

  if (result.status === "label_not_found") {
    throw new AppError("label_not_found", 404, "Label not found.");
  }

  const rows = await issuesService.listIssueLabels(req.ctx.organizationId, req.ctx.issueId);
  const body = listLabelsResponseSchema.parse({ data: rows.map(toWireFormat) });
  res.json(body);
}

export async function listAttachments(req: Request, res: Response) {
  if (!req.ctx?.issueId) {
    throw new Error("listAttachments requires requireIssue to have run first");
  }

  const rows = await issuesService.listAttachments(req.ctx.organizationId, req.ctx.issueId);
  const body = listAttachmentsResponseSchema.parse({ data: rows.map(toAttachmentWireFormat) });
  res.json(body);
}

// multer's own validation (fileFilter/limits) rejects a bad upload
// before this ever runs — reaching here means req.file is a real,
// already-validated file. req.file is still optional per multer's own
// types (no file field sent at all is a different failure mode than a
// disallowed one), so this is checked explicitly rather than asserted.
export async function uploadAttachment(req: Request, res: Response) {
  if (!req.ctx?.issueId) {
    throw new Error("uploadAttachment requires requireIssue to have run first");
  }
  if (!req.file) {
    throw new AppError("validation_error", 400, "No file was uploaded.");
  }

  // An optional multipart text field: attach the file to one of the uploader's
  // own comments. An empty value means "not a comment file".
  const rawCommentId = typeof req.body?.commentId === "string" ? req.body.commentId : "";
  let commentId: string | undefined;
  if (rawCommentId !== "") {
    const parsedCommentId = z.uuid().safeParse(rawCommentId);
    if (!parsedCommentId.success) {
      throw new AppError("invalid_comment_id", 400, "commentId must be a UUID.");
    }
    commentId = parsedCommentId.data;
  }

  // Another optional text field: "true" means a picture pasted into a comment box and not posted yet (ADR 0062).
  const draft = req.body?.draft === "true";
  if (draft && commentId) {
    throw new AppError("validation_error", 400, "A draft picture cannot also belong to a comment.");
  }

  const result = await issuesService.uploadAttachment({
    organizationId: req.ctx.organizationId,
    issueId: req.ctx.issueId,
    uploaderId: req.ctx.userId,
    filename: req.file.originalname,
    mimeType: req.file.mimetype,
    buffer: req.file.buffer,
    commentId,
    draft,
  });
  if (result.status === "draft_not_image") {
    throw new AppError("draft_not_image", 400, "Only images (PNG, JPEG, GIF or WebP) can be pasted into a comment.");
  }
  if (result.status === "comment_not_found") throw new AppError("comment_not_found", 404, "Comment not found.");
  if (result.status === "comment_forbidden") {
    throw new AppError("comment_forbidden", 403, "You can only attach files to your own comments.");
  }

  const body = attachmentResponseSchema.parse({ data: toAttachmentWireFormat(result.attachment) });
  res.status(201).json(body);
}

export async function deleteAttachment(req: Request, res: Response) {
  if (!req.ctx?.issueId) {
    throw new Error("deleteAttachment requires requireIssue to have run first");
  }

  const parsedAttachmentId = z.uuid().safeParse(req.params.attachmentId);
  if (!parsedAttachmentId.success) {
    throw new AppError("invalid_attachment_id", 400, "attachmentId must be a UUID.");
  }

  const result = await issuesService.deleteAttachment({
    organizationId: req.ctx.organizationId,
    issueId: req.ctx.issueId,
    attachmentId: parsedAttachmentId.data,
    actorId: req.ctx.userId,
  });

  if (result.status === "not_found") {
    throw new AppError("attachment_not_found", 404, "Attachment not found.");
  }

  res.status(204).end();
}

const downloadTokenQuerySchema = z.object({
  expires: z.coerce.number(),
  sig: z.string().min(1),
});

/**
 * Deliberately no requireAuth/requireOrgMembership/requireIssue chain
 * — the signed token in the query string is the sole authorization,
 * matching real presigned-URL semantics (see lib/storage.ts and the
 * Phase 7 slice 4 plan). Anyone with a valid, unexpired token can
 * download — that's the intended trust model, not an oversight.
 */
export async function downloadAttachment(req: Request, res: Response) {
  const parsedAttachmentId = z.uuid().safeParse(req.params.attachmentId);
  const parsedQuery = downloadTokenQuerySchema.safeParse(req.query);
  if (!parsedAttachmentId.success || !parsedQuery.success) {
    throw new AppError("invalid_download_link", 400, "This download link is malformed.");
  }

  const attachmentId = parsedAttachmentId.data;
  const { expires, sig } = parsedQuery.data;
  if (!storage.verifyDownloadToken(attachmentId, expires, sig)) {
    throw new AppError("invalid_download_link", 403, "This download link is invalid or has expired.");
  }

  const attachment = await issuesService.getAttachmentForDownload(attachmentId);
  if (!attachment) {
    throw new AppError("attachment_not_found", 404, "Attachment not found.");
  }

  let size: number;
  try {
    size = await storage.statFile(attachment.storageKey);
  } catch {
    throw new AppError("attachment_not_found", 404, "Attachment not found.");
  }

  res.setHeader("Content-Type", attachment.mimeType);
  res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(attachment.filename)}"`);
  // The type was client-supplied at upload; stop the browser second-guessing it.
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Accept-Ranges", "bytes");

  const range = parseRange(req.header("range"), size);
  if (range.kind === "unsatisfiable") {
    res.status(416).setHeader("Content-Range", `bytes */${size}`);
    res.end();
    return;
  }

  let stream;
  try {
    stream =
      range.kind === "range"
        ? await storage.readFileStream(attachment.storageKey, range)
        : await storage.readFileStream(attachment.storageKey);
  } catch {
    throw new AppError("attachment_not_found", 404, "Attachment not found.");
  }
  if (range.kind === "range") {
    res.status(206);
    res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
    res.setHeader("Content-Length", range.end - range.start + 1);
  } else {
    res.setHeader("Content-Length", size);
  }
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}

export async function deleteIssue(req: Request, res: Response) {
  if (!req.ctx?.projectId || !req.ctx.issueId) {
    throw new Error("deleteIssue requires requireIssue to have run first");
  }

  const result = await issuesService.deleteIssue({
    organizationId: req.ctx.organizationId,
    projectId: req.ctx.projectId,
    issueId: req.ctx.issueId,
    actorId: req.ctx.userId,
    actorRole: req.ctx.role,
  });

  if (result.status === "not_found") {
    throw new AppError("issue_not_found", 404, "Issue not found.");
  }
  if (result.status === "forbidden") {
    throw new AppError("forbidden", 403, "Only the person who reported an issue, or an owner or admin, can delete it.");
  }

  res.status(204).end();
}
