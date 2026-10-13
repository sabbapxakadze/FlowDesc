import { apiTokenListResponseSchema } from "@flowdesc/contracts";
import { apiGet } from "../../../shared/api/client";

export function fetchApiTokens() {
  return apiGet("/v1/users/me/api-tokens", apiTokenListResponseSchema).then((res) => res.data);
}
