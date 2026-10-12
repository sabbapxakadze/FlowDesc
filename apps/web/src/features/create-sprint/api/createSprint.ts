import { createSprintResponseSchema, type CreateSprintRequest } from "@flowdesc/contracts";
import { apiPost } from "../../../shared/api/client";

export function createSprint(organizationId: string, projectId: string, input: CreateSprintRequest) {
  return apiPost(
    `/v1/organizations/${organizationId}/projects/${projectId}/sprints`,
    input,
    createSprintResponseSchema,
  ).then((res) => res.data);
}
