import { getBoardResponseSchema } from "@flowdesc/contracts";
import { apiGet } from "../../../shared/api/client";

/** Unpaginated on purpose — see the Phase 5 slice 1 plan's "Decisions"
 * section: a board's whole point is seeing everything at a glance. */
export function fetchBoard(organizationId: string, projectId: string) {
  return apiGet(
    `/v1/organizations/${organizationId}/projects/${projectId}/board`,
    getBoardResponseSchema,
  ).then((res) => res.data);
}
