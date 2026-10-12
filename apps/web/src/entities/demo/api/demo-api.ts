import { useQuery } from "@tanstack/react-query";
import { authSessionSchema, demoInfoResponseSchema } from "@flowdesc/contracts";
import { apiGet, apiPost } from "../../../shared/api/client";

/** Whether this server offers "Try the demo", and how long a visitor's private copy lives (ADR 0044). The buttons are drawn only when it does. */
export function useDemoInfo() {
  return useQuery({
    queryKey: ["demo", "info"],
    queryFn: () => apiGet("/v1/demo/info", demoInfoResponseSchema).then((r) => r.data),
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** The key of the "start a demo" mutation, so a message elsewhere on the page (the note under the buttons) can show its error. */
export const DEMO_START_KEY = ["demo", "start"] as const;

/** Asks the server for a fresh private copy of the demo; the answer is a session, the same shape as a login's. */
export function startDemo() {
  return apiPost("/v1/demo/start", {}, authSessionSchema);
}
