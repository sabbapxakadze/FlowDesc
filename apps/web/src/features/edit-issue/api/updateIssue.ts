import { updateIssueResponseSchema, type UpdateIssueRequest } from "@flowdesc/contracts";
import { apiPatch } from "../../../shared/api/client";

export function updateIssue(
  organizationId: string,
  projectId: string,
  issueId: string,
  input: UpdateIssueRequest,
) {
  return apiPatch(
    `/v1/organizations/${organizationId}/projects/${projectId}/issues/${issueId}`,
    input,
    updateIssueResponseSchema,
  ).then((res) => res.data);
}
