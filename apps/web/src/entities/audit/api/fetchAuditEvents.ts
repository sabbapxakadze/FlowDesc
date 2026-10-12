import { listAuditEventsResponseSchema } from "@flowdesc/contracts";
import { apiGet } from "../../../shared/api/client";
import type { AuditFilters } from "./queryKeys";

/** cursor is opaque and server-made; this only round-trips one a previous page handed back. */
export function fetchAuditEvents(organizationId: string, { cursor, actor, kind }: AuditFilters & { cursor?: string } = {}) {
  const params = new URLSearchParams();
  if (cursor) params.set("cursor", cursor);
  if (actor) params.set("actor", actor);
  if (kind) params.set("kind", kind);
  const query = params.size > 0 ? `?${params.toString()}` : "";
  return apiGet(`/v1/organizations/${organizationId}/audit-events${query}`, listAuditEventsResponseSchema);
}
