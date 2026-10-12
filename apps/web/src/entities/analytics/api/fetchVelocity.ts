import { velocityResponseSchema } from "@flowdesc/contracts";
import { apiGet } from "../../../shared/api/client";

export function fetchVelocity(organizationId: string, projectId: string, sprints: number) {
  return apiGet(
    `/v1/organizations/${organizationId}/projects/${projectId}/analytics/velocity?sprints=${sprints}`,
    velocityResponseSchema,
  );
}
