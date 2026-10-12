import { attachmentResponseSchema } from "@flowdesc/contracts";
import { apiUpload } from "../../../shared/api/client";

export function uploadAttachment(organizationId: string, projectId: string, issueId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);

  return apiUpload(
    `/v1/organizations/${organizationId}/projects/${projectId}/issues/${issueId}/attachments`,
    formData,
    attachmentResponseSchema,
  ).then((res) => res.data);
}
