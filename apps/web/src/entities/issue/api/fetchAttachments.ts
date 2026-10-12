import { listAttachmentsResponseSchema } from "@flowdesc/contracts";
import { apiGet } from "../../../shared/api/client";

export function fetchAttachments(organizationId: string, projectId: string, issueId: string) {
  return apiGet(
    `/v1/organizations/${organizationId}/projects/${projectId}/issues/${issueId}/attachments`,
    listAttachmentsResponseSchema,
  ).then((res) => res.data);
}
