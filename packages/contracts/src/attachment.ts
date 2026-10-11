import { z } from "zod";

/**
 * Shared with the frontend so the upload form can give real-time
 * feedback using the *exact* rule the server enforces — same "one
 * source of truth" reasoning as every schema here. The server still
 * fully re-validates (multer's fileFilter/limits) — this constant isn't
 * itself the security boundary, just the single place both sides read
 * the same rule from.
 */
export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "video/mp4",
  "video/webm",
] as const;

export const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

/**
 * downloadUrl is minted fresh on every list read (see
 * issues.repository.ts's listAttachmentsForIssue +
 * lib/storage.ts's signDownloadToken) — a genuinely time-limited signed
 * URL, not a stored value. No separate "mint a signed URL" endpoint.
 */
export const attachmentSchema = z.object({
  id: z.uuid(),
  issueId: z.uuid(),
  uploaderId: z.uuid(),
  uploaderName: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number(),
  createdAt: z.iso.datetime(),
  /**
   * Set when the file was attached to a comment. Comment files are also listed
   * with the issue's attachments; a file uploaded straight to the issue has no
   * comment (null) and never appears inside one.
   */
  commentId: z.uuid().nullable(),
  downloadUrl: z.string(),
});

export type Attachment = z.infer<typeof attachmentSchema>;

export const listAttachmentsResponseSchema = z.object({
  data: z.array(attachmentSchema),
});

export type ListAttachmentsResponse = z.infer<typeof listAttachmentsResponseSchema>;

export const attachmentResponseSchema = z.object({
  data: attachmentSchema,
});

export type AttachmentResponse = z.infer<typeof attachmentResponseSchema>;

/**
 * A picture pasted into the New issue popup before the issue exists (ADR 0063): a draft that belongs to the project, so there is no issue id
 * yet. Creating the issue links it.
 */
export const draftImageSchema = z.object({
  id: z.uuid(),
  filename: z.string(),
  mimeType: z.string(),
  downloadUrl: z.string(),
});

export const draftImageResponseSchema = z.object({
  data: draftImageSchema,
});

export type DraftImage = z.infer<typeof draftImageSchema>;
