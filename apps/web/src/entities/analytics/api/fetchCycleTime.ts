import { cycleTimeResponseSchema } from "@flowdesc/contracts";
import { apiGet } from "../../../shared/api/client";

export function fetchCycleTime(organizationId: string, projectId: string, weeks: number) {
  return apiGet(
    `/v1/organizations/${organizationId}/projects/${projectId}/analytics/cycle-time?weeks=${weeks}`,
    cycleTimeResponseSchema,
  );
}
