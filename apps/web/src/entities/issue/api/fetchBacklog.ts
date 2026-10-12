import { getBacklogResponseSchema } from "@flowdesc/contracts";
import { apiGet } from "../../../shared/api/client";

/** Unpaginated on purpose, same reasoning as fetchBoard — see the
 * Phase 5 slice 4 plan's "Decisions" section. */
export function fetchBacklog(organizationId: string, projectId: string) {
  return apiGet(
    `/v1/organizations/${organizationId}/projects/${projectId}/backlog`,
    getBacklogResponseSchema,
  );
}
