import { listOrganizationMembersResponseSchema } from "@flowdesc/contracts";
import { apiGet } from "../../../shared/api/client";

export function fetchMembers(organizationId: string) {
  return apiGet(
    `/v1/organizations/${organizationId}/members`,
    listOrganizationMembersResponseSchema,
  ).then((res) => res.data);
}
