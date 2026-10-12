import { sprintResponseSchema, type RenameSprintRequest } from "@flowdesc/contracts";
import { apiPatch } from "../../../shared/api/client";

export function renameSprint(
  organizationId: string,
  projectId: string,
  sprintId: string,
  input: RenameSprintRequest,
) {
  return apiPatch(
    `/v1/organizations/${organizationId}/projects/${projectId}/sprints/${sprintId}`,
    input,
    sprintResponseSchema,
  ).then((res) => res.data);
}
