import { updateIssueResponseSchema, type AssignIssueSprintRequest } from "@flowdesc/contracts";
import { apiPatch } from "../../../shared/api/client";

export function assignIssueSprint(
  organizationId: string,
  projectId: string,
  issueId: string,
  input: AssignIssueSprintRequest,
) {
  return apiPatch(
    `/v1/organizations/${organizationId}/projects/${projectId}/issues/${issueId}/sprint`,
    input,
    updateIssueResponseSchema,
  ).then((res) => res.data);
}
