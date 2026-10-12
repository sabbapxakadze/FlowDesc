import { updateIssueResponseSchema, type MoveIssueRequest } from "@flowdesc/contracts";
import { apiPatch } from "../../../shared/api/client";

// Response reuses updateIssueResponseSchema — see the contract's own
// comment on why moveIssueResponseSchema doesn't exist as a separate type.
export function moveIssue(
  organizationId: string,
  projectId: string,
  issueId: string,
  input: MoveIssueRequest,
) {
  return apiPatch(
    `/v1/organizations/${organizationId}/projects/${projectId}/issues/${issueId}/move`,
    input,
    updateIssueResponseSchema,
  ).then((res) => res.data);
}
