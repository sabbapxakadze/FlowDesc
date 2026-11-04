import { askInfoResponseSchema, askResponseSchema } from "@flowdesc/contracts";
import { apiGet, apiPost } from "../../../shared/api/client";

/** Whether Ask is switched on (public, like the demo's info). The panel and its sidebar row hide themselves when it is not. */
export async function fetchAskInfo() {
  return (await apiGet("/v1/ask/info", askInfoResponseSchema)).data;
}

/** One question. The server checks the person's membership, the limits and the question again; nothing here is trusted by it. */
export async function postAsk(organizationId: string, question: string) {
  return (await apiPost(`/v1/organizations/${organizationId}/ask`, { question }, askResponseSchema)).data;
}
