import { sprintResponseSchema, type CompleteSprintRequest } from "@flowdesc/contracts";
import { apiPatch } from "../../../shared/api/client";

export function completeSprint(
  organizationId: string,
  projectId: string,
  sprintId: string,
  input: CompleteSprintRequest,
) {
  return apiPatch(
    `/v1/organizations/${organizationId}/projects/${projectId}/sprints/${sprintId}/complete`,
    input,
    sprintResponseSchema,
  ).then((res) => res.data);
}
