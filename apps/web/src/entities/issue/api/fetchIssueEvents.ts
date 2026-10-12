import { listIssueEventsResponseSchema } from "@flowdesc/contracts";
import { apiGet } from "../../../shared/api/client";

export function fetchIssueEvents(organizationId: string, projectId: string, issueId: string) {
  return apiGet(
    `/v1/organizations/${organizationId}/projects/${projectId}/issues/${issueId}/events`,
    listIssueEventsResponseSchema,
  ).then((res) => res.data);
}
