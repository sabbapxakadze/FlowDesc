import { previewInvitationResponseSchema } from "@flowdesc/contracts";
import { apiPost } from "../../../shared/api/client";

/** Public: the token in the body is the authorization. Safe to repeat (it does not use the invitation up). */
export function previewInvitation(token: string) {
  return apiPost("/v1/invitations/preview", { token }, previewInvitationResponseSchema);
}
