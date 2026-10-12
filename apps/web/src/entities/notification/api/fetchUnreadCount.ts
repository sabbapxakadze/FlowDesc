import { unreadCountResponseSchema } from "@flowdesc/contracts";
import { apiGet } from "../../../shared/api/client";

export function fetchUnreadCount(organizationId: string) {
  return apiGet(`/v1/organizations/${organizationId}/notifications/unread-count`, unreadCountResponseSchema).then(
    (res) => res.count,
  );
}
