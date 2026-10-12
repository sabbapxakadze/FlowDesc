import { listLabelsResponseSchema } from "@flowdesc/contracts";
import { apiPost } from "../../../shared/api/client";

export function attachLabel(
  organizationId: string,
  projectId: string,
  issueId: string,
  labelId: string,
) {
  return apiPost(
    `/v1/organizations/${organizationId}/projects/${projectId}/issues/${issueId}/labels`,
    { labelId },
    listLabelsResponseSchema,
  ).then((res) => res.data);
}
