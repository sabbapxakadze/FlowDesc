import { Router, type Router as RouterType, type NextFunction, type Request, type Response } from "express";
import multer, { MulterError } from "multer";
import { ALLOWED_ATTACHMENT_MIME_TYPES, MAX_ATTACHMENT_SIZE_BYTES } from "@flowdesc/contracts";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireOrgMembership } from "../../middleware/require-org-membership.js";
import { requireProject } from "../../middleware/require-project.js";
import { requireIssue } from "../../middleware/require-issue.js";
import { requirePermission } from "../../middleware/require-permission.js";
import { AppError } from "../../shared/errors.js";
import { denyInDemo } from "../demo/demo.guard.js";
import * as issuesController from "./issues.controller.js";

export const issuesRouter: RouterType = Router();

// Memory storage, not disk storage — the service layer writes the
// validated buffer to disk itself (lib/storage.ts), right where it
// also generates the storage key. Fine at this size cap; no streaming
// complexity needed for single-digit-MB files. See the Phase 7 slice
// 4 plan's "Decisions".
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_SIZE_BYTES },
  fileFilter(_req, file, cb) {
    if (!(ALLOWED_ATTACHMENT_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      cb(new AppError("unsupported_file_type", 400, `Files of type "${file.mimetype}" are not allowed.`));
      return;
    }
    cb(null, true);
  },
});

// multer's own errors (MulterError, or the AppError thrown from
// fileFilter above) never reach the client raw — same "no raw throws
// reaching the client" rule as everywhere else in this codebase.
function parseAttachmentUpload(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, (err: unknown) => {
    if (err instanceof AppError) {
      next(err);
      return;
    }
    if (err instanceof MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        next(
          new AppError(
            "file_too_large",
            400,
            `File exceeds the ${MAX_ATTACHMENT_SIZE_BYTES} byte limit.`,
          ),
        );
        return;
      }
      next(new AppError("upload_error", 400, err.message));
      return;
    }
    next(err);
  });
}

// Nested under both organization and project: requireAuth -> who are you,
// requireOrgMembership -> are you in this org, requireProject -> does
// :projectId actually belong to that org, requirePermission -> does your
// role allow this action. Same chain shape as projects.routes.ts, one
// link longer.
issuesRouter.get(
  "/organizations/:organizationId/projects/:projectId/issues",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requirePermission("view_issue"),
  issuesController.listIssues,
);

// Not nested under /issues — the resource is "the board," not an issue.
// Still lives in this module: same table, same scoping as every other
// issues query here (this module already owns labels/comments/events
// alongside issues themselves).
issuesRouter.get(
  "/organizations/:organizationId/projects/:projectId/board",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requirePermission("view_issue"),
  issuesController.getBoard,
);

// Not nested under /issues, same reasoning as /board — the resource is
// "the backlog view," composed from both sprints and issues.
issuesRouter.get(
  "/organizations/:organizationId/projects/:projectId/backlog",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requirePermission("view_issue"),
  issuesController.getBacklog,
);

// Org-scoped, not nested under /projects/:projectId — a command palette
// (Phase 7 slice 2) needs to search across the whole org, not one project.
// requireOrgMembership only, no requireProject: there's no :projectId in
// this path to verify. Same view_issue permission listIssues already
// requires, no new permission.
issuesRouter.get(
  "/organizations/:organizationId/search",
  requireAuth,
  requireOrgMembership,
  requirePermission("view_issue"),
  issuesController.search,
);

// By per-project number (ADR 0030), for readable addresses. Registered before the ":issueId" read so the literal
// segment is never taken for an id.
issuesRouter.get(
  "/organizations/:organizationId/projects/:projectId/issues/by-number/:number",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requirePermission("view_issue"),
  issuesController.getIssueByNumber,
);

issuesRouter.get(
  "/organizations/:organizationId/projects/:projectId/issues/:issueId",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requireIssue,
  requirePermission("view_issue"),
  issuesController.getIssue,
);

issuesRouter.post(
  "/organizations/:organizationId/projects/:projectId/issues",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requirePermission("manage_issue"),
  issuesController.createIssue,
);

issuesRouter.patch(
  "/organizations/:organizationId/projects/:projectId/issues/:issueId",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requireIssue,
  requirePermission("manage_issue"),
  issuesController.updateIssue,
);

issuesRouter.patch(
  "/organizations/:organizationId/projects/:projectId/issues/:issueId/move",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requireIssue,
  requirePermission("manage_issue"),
  issuesController.moveIssue,
);

issuesRouter.patch(
  "/organizations/:organizationId/projects/:projectId/issues/:issueId/sprint",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requireIssue,
  requirePermission("manage_issue"),
  issuesController.assignIssueSprint,
);

issuesRouter.get(
  "/organizations/:organizationId/projects/:projectId/issues/:issueId/labels",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requireIssue,
  requirePermission("view_issue"),
  issuesController.listIssueLabels,
);

issuesRouter.post(
  "/organizations/:organizationId/projects/:projectId/issues/:issueId/labels",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requireIssue,
  requirePermission("manage_issue"),
  issuesController.attachLabel,
);

issuesRouter.delete(
  "/organizations/:organizationId/projects/:projectId/issues/:issueId/labels/:labelId",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requireIssue,
  requirePermission("manage_issue"),
  issuesController.detachLabel,
);

issuesRouter.post(
  "/organizations/:organizationId/projects/:projectId/issues/:issueId/comments",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requireIssue,
  requirePermission("manage_issue"),
  issuesController.createComment,
);

// Edit: the author only. Delete: the author, or an owner/admin. The permission
// middleware here is only the floor (manage_issue); who owns the comment is a
// decision the service makes against the real row.
issuesRouter.patch(
  "/organizations/:organizationId/projects/:projectId/issues/:issueId/comments/:commentId",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requireIssue,
  requirePermission("manage_issue"),
  issuesController.updateComment,
);

issuesRouter.delete(
  "/organizations/:organizationId/projects/:projectId/issues/:issueId/comments/:commentId",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requireIssue,
  requirePermission("manage_issue"),
  issuesController.deleteComment,
);

issuesRouter.get(
  "/organizations/:organizationId/projects/:projectId/issues/:issueId/events",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requireIssue,
  requirePermission("view_issue"),
  issuesController.listIssueEvents,
);

issuesRouter.get(
  "/organizations/:organizationId/projects/:projectId/issues/:issueId/attachments",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requireIssue,
  requirePermission("view_issue"),
  issuesController.listAttachments,
);

// requirePermission runs before parseAttachmentUpload — an unauthorized
// caller is rejected before this ever spends effort parsing their
// upload body.
issuesRouter.post(
  "/organizations/:organizationId/projects/:projectId/issues/:issueId/attachments",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requireIssue,
  requirePermission("manage_issue"),
  denyInDemo("Uploading files"),
  parseAttachmentUpload,
  issuesController.uploadAttachment,
);

// A picture pasted into the New issue popup, before the issue exists (ADR 0063): a draft of the project. Same guards as every upload.
issuesRouter.post(
  "/organizations/:organizationId/projects/:projectId/draft-images",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requirePermission("manage_issue"),
  denyInDemo("Uploading files"),
  parseAttachmentUpload,
  issuesController.uploadProjectDraftImage,
);

issuesRouter.delete(
  "/organizations/:organizationId/projects/:projectId/issues/:issueId/attachments/:attachmentId",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requireIssue,
  requirePermission("manage_issue"),
  issuesController.deleteAttachment,
);

// Deliberately not nested under /organizations/:organizationId/... and
// no auth middleware chain at all — a signed download link is
// self-contained authorization, the same trust model a real S3
// presigned URL has. See issuesController.downloadAttachment and
// lib/storage.ts.
issuesRouter.get("/attachments/:attachmentId/download", issuesController.downloadAttachment);

// Delete: manage_issue is only the floor (it keeps viewers out). Whether THIS
// person reported the issue, or is an owner/admin, is decided in the service.
issuesRouter.delete(
  "/organizations/:organizationId/projects/:projectId/issues/:issueId",
  requireAuth,
  requireOrgMembership,
  requireProject,
  requireIssue,
  requirePermission("manage_issue"),
  issuesController.deleteIssue,
);
