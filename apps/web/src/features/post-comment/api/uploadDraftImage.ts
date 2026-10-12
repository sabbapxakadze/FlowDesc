import { attachmentResponseSchema } from "@flowdesc/contracts";
import { apiUpload } from "../../../shared/api/client";

/**
 * A picture pasted into the comment box (ADR 0062): uploaded at once as a draft, which the server keeps quiet (no event, no notification) until a
 * comment that shows it is posted. Same endpoint as the other uploads, with the text field `draft`.
 */
export function uploadDraftImage(organizationId: string, projectId: string, issueId: string, file: File) {
  const formData = new FormData();
  formData.append("draft", "true");
  formData.append("file", file);

  return apiUpload(
    `/v1/organizations/${organizationId}/projects/${projectId}/issues/${issueId}/attachments`,
    formData,
    attachmentResponseSchema,
  ).then((res) => res.data);
}
