import type { ConfirmPasswordResetRequest } from "@flowdesc/contracts";
import { apiPostVoid } from "../../../shared/api/client";

export function resetPassword(input: ConfirmPasswordResetRequest) {
  return apiPostVoid("/v1/auth/password-reset/confirm", input);
}
