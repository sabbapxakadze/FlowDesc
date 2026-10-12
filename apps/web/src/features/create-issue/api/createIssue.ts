import { createIssueResponseSchema, type CreateIssueRequest } from "@flowdesc/contracts";
import { apiPost } from "../../../shared/api/client";

export function createIssue(organizationId: string, projectId: string, input: CreateIssueRequest) {
  return apiPost(
    `/v1/organizations/${organizationId}/projects/${projectId}/issues`,
    input,
    createIssueResponseSchema,
  ).then((res) => res.data);
}
