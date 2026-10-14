import { z } from "zod";

/**
 * "Report a bug" (ADR 0075): a signed-in person sends a description and up to three screenshots, and the owner gets an email. The limits are
 * shared so the form and the server cannot disagree about what is allowed.
 */
export const BUG_REPORT_MAX_FILES = 3;
export const BUG_REPORT_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const BUG_REPORT_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const BUG_REPORT_MAX_DESCRIPTION = 5000;

/** The text fields of the multipart request. Who is reporting is not here: the server knows that and the form must not be trusted with it. */
export const createBugReportRequestSchema = z.object({
  description: z.string().trim().min(1, "Tell us what went wrong.").max(BUG_REPORT_MAX_DESCRIPTION, `Use ${BUG_REPORT_MAX_DESCRIPTION} characters or fewer.`),
  /** The page the person was on (path and query). Only a hint for the owner, so it is just bounded. */
  page: z.string().max(500).optional(),
  /** The window size, for example "1280x720". */
  viewport: z.string().max(20).optional(),
});
export type CreateBugReportRequest = z.infer<typeof createBugReportRequestSchema>;

export const createBugReportResponseSchema = z.object({ data: z.object({ sent: z.literal(true) }) });
export type CreateBugReportResponse = z.infer<typeof createBugReportResponseSchema>;
