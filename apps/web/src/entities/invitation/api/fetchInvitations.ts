import { listInvitationsResponseSchema } from "@flowdesc/contracts";
import { apiGet } from "../../../shared/api/client";

export function fetchInvitations(organizationId: string) {
  return apiGet(`/v1/organizations/${organizationId}/invitations`, listInvitationsResponseSchema).then(
    (res) => res.data,
  );
}
