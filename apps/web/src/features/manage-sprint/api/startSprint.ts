import { sprintResponseSchema, type StartSprintRequest } from "@flowdesc/contracts";
import { apiPatch } from "../../../shared/api/client";

export function startSprint(organizationId: string, projectId: string, sprintId: string, input: StartSprintRequest) {
  return apiPatch(
    `/v1/organizations/${organizationId}/projects/${projectId}/sprints/${sprintId}/start`,
    input,
    sprintResponseSchema,
  ).then((res) => res.data);
}
