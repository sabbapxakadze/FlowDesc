import { createProjectResponseSchema, type CreateProjectRequest } from "@flowdesc/contracts";
import { apiPost } from "../../../shared/api/client";

export function createProject(organizationId: string, input: CreateProjectRequest) {
  return apiPost(
    `/v1/organizations/${organizationId}/projects`,
    input,
    createProjectResponseSchema,
  ).then((res) => res.data);
}
