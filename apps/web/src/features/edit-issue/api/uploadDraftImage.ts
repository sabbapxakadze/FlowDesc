import { attachmentResponseSchema } from "@flowdesk/contracts";
import { apiUpload } from "../../../shared/api/client";

/**
 * A picture pasted into the description in the edit popup (ADR 0063): uploaded at once as a draft of THIS issue (silent: no event, no notification);
 * saving the description links it. Kept here, not imported from the comment feature: a feature may not import a sibling feature.
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
