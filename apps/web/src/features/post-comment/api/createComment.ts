import { createCommentResponseSchema, type CreateCommentRequest } from "@flowdesc/contracts";
import { apiPost } from "../../../shared/api/client";

export function createComment(
  organizationId: string,
  projectId: string,
  issueId: string,
  input: CreateCommentRequest,
) {
  return apiPost(
    `/v1/organizations/${organizationId}/projects/${projectId}/issues/${issueId}/comments`,
    input,
    createCommentResponseSchema,
  ).then((res) => res.data);
}
