import { getAccountResponseSchema } from "@flowdesc/contracts";
import { apiGet } from "../../../shared/api/client";

export function fetchAccount() {
  return apiGet("/v1/users/me/account", getAccountResponseSchema).then((res) => res.data);
}
