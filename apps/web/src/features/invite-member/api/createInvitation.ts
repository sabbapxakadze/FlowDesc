import {
  createInvitationResponseSchema,
  type CreateInvitationRequest,
} from "@flowdesc/contracts";
import { apiPost } from "../../../shared/api/client";

export function createInvitation(organizationId: string, input: CreateInvitationRequest) {
  return apiPost(
    `/v1/organizations/${organizationId}/invitations`,
    input,
    createInvitationResponseSchema,
  );
}
