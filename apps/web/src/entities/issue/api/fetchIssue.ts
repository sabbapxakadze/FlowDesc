import { getIssueResponseSchema } from "@flowdesc/contracts";
import { apiGet } from "../../../shared/api/client";

export function fetchIssue(organizationId: string, projectId: string, issueId: string) {
  return apiGet(
    `/v1/organizations/${organizationId}/projects/${projectId}/issues/${issueId}`,
    getIssueResponseSchema,
  ).then((res) => res.data);
}
