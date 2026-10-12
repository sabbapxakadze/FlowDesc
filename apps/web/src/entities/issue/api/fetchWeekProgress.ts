import { weekProgressResponseSchema } from "@flowdesc/contracts";
import { apiGet } from "../../../shared/api/client";

/** Of my issues due from `from` to `to` (calendar days, both included): how many are done and how many there are (the My work ring). */
export function fetchWeekProgress(organizationId: string, from: string, to: string) {
  return apiGet(`/v1/organizations/${organizationId}/my-work/week?from=${from}&to=${to}`, weekProgressResponseSchema);
}
