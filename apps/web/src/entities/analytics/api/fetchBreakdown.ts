import { breakdownResponseSchema } from "@flowdesc/contracts";
import { apiGet } from "../../../shared/api/client";

export function fetchBreakdown(organizationId: string, projectId: string) {
  return apiGet(`/v1/organizations/${organizationId}/projects/${projectId}/analytics/breakdown`, breakdownResponseSchema);
}
