import { authSessionSchema, type LoginRequest } from "@flowdesc/contracts";
import { apiPost } from "../../../shared/api/client";

export function loginUser(input: LoginRequest) {
  return apiPost("/v1/auth/login", input, authSessionSchema);
}
