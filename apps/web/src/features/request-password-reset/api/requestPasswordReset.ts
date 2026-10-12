import type { RequestPasswordResetRequest } from "@flowdesc/contracts";
import { apiPostVoid } from "../../../shared/api/client";

export function requestPasswordReset(input: RequestPasswordResetRequest) {
  return apiPostVoid("/v1/auth/password-reset/request", input);
}
