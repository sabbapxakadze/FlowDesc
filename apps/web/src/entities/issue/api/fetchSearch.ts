import { searchIssuesResponseSchema } from "@flowdesc/contracts";
import { apiGet } from "../../../shared/api/client";

/** Org-scoped, not project-scoped — see issues.routes.ts's search route. */
export function fetchSearch(organizationId: string, query: string) {
  return apiGet(
    `/v1/organizations/${organizationId}/search?q=${encodeURIComponent(query)}`,
    searchIssuesResponseSchema,
  ).then((res) => res.data);
}
