import { updateCommentResponseSchema, type UpdateCommentRequest } from "@flowdesc/contracts";
import { apiPatch } from "../../../shared/api/client";

export function updateComment(
  organizationId: string,
  projectId: string,
  issueId: string,
  commentId: string,
  input: UpdateCommentRequest,
) {
  return apiPatch(
    `/v1/organizations/${organizationId}/projects/${projectId}/issues/${issueId}/comments/${commentId}`,
    input,
    updateCommentResponseSchema,
  ).then((res) => res.data);
}
