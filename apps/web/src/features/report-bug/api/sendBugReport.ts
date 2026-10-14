import { createBugReportResponseSchema } from "@flowdesc/contracts";
import { apiUpload } from "../../../shared/api/client";

/** One multipart request: the text fields and up to three pictures (ADR 0075). Who is sending is not in it; the server knows. */
export function sendBugReport(input: { description: string; page: string; viewport: string; files: File[] }) {
  const formData = new FormData();
  formData.append("description", input.description);
  formData.append("page", input.page);
  formData.append("viewport", input.viewport);
  for (const file of input.files) formData.append("screenshots", file);
  return apiUpload("/v1/bug-reports", formData, createBugReportResponseSchema);
}
