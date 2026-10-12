import { listProjectsResponseSchema } from "@flowdesc/contracts";
import { apiGet } from "../../../shared/api/client";

export function fetchProjects(organizationId: string) {
  return apiGet(`/v1/organizations/${organizationId}/projects`, listProjectsResponseSchema).then(
    (res) => res.data,
  );
}
