import { listAssignedIssuesResponseSchema } from "@flowdesc/contracts";
import { apiGet } from "../../../shared/api/client";

/** The caller's open issues across all projects of the organization (the "my work" page). */
export function fetchAssignedIssues(organizationId: string, limit: number) {
  return apiGet(`/v1/organizations/${organizationId}/my-work/issues?limit=${limit}`, listAssignedIssuesResponseSchema);
}
