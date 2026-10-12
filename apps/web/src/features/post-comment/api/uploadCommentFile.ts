import { attachmentResponseSchema } from "@flowdesc/contracts";
import { apiUpload } from "../../../shared/api/client";

/**
 * Same endpoint as a plain attachment upload, plus the optional `commentId`
 * text field that ties the file to a comment. Kept here, not imported from
 * features/upload-attachment: a feature may not import a sibling feature.
 */
export function uploadCommentFile(
  organizationId: string,
  projectId: string,
  issueId: string,
  commentId: string,
  file: File,
) {
  const formData = new FormData();
  formData.append("commentId", commentId);
  formData.append("file", file);

  return apiUpload(
    `/v1/organizations/${organizationId}/projects/${projectId}/issues/${issueId}/attachments`,
    formData,
    attachmentResponseSchema,
  ).then((res) => res.data);
}
