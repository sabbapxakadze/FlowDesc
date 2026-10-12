import { listLabelsResponseSchema } from "@flowdesc/contracts";
import { apiDelete } from "../../../shared/api/client";

export function detachLabel(
  organizationId: string,
  projectId: string,
  issueId: string,
  labelId: string,
) {
  return apiDelete(
    `/v1/organizations/${organizationId}/projects/${projectId}/issues/${issueId}/labels/${labelId}`,
    listLabelsResponseSchema,
  ).then((res) => res.data);
}
