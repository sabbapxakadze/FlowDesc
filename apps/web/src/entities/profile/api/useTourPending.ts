import { useQuery } from "@tanstack/react-query";
import { tourPendingResponseSchema } from "@flowdesc/contracts";
import { apiGet } from "../../../shared/api/client";
import { profileKeys } from "./queryKeys";

/** Whether the guided tour should start by itself for this person (their first visit to the app). Kept under profileKeys.all like the profile card's. */
export function tourKey() {
  return [...profileKeys.all, "tour"] as const;
}

export function useTourPending(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: tourKey(),
    queryFn: () => apiGet("/v1/users/me/tour", tourPendingResponseSchema).then((res) => res.pending),
    enabled: options.enabled ?? true,
    staleTime: Infinity, // it only ever goes from true to false, and the page that starts the tour is the one that makes it false
  });
}
