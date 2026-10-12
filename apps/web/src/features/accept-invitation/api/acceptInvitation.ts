import { acceptInvitationResponseSchema } from "@flowdesc/contracts";
import { apiPost } from "../../../shared/api/client";

export function acceptInvitation(input: { token: string; name?: string; password?: string }) {
  return apiPost("/v1/invitations/accept", input, acceptInvitationResponseSchema);
}
