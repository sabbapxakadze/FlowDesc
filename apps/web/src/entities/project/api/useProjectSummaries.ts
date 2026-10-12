import { useQuery } from "@tanstack/react-query";
import { listProjectSummariesResponseSchema } from "@flowdesc/contracts";
import { apiGet } from "../../../shared/api/client";
import { projectKeys } from "./queryKeys";

/**
 * The numbers on the Projects page's cards: counts by state, the running sprint and the last change, per project. `today` is the person's own
 * calendar day (ADR 0032), so "overdue" agrees with the markers on the cards. Always re-read when the page opens.
 */
export function useProjectSummaries(organizationId: string, today: string) {
  return useQuery({
    queryKey: [...projectKeys.summaries(organizationId), today] as const,
    queryFn: () => apiGet(`/v1/organizations/${organizationId}/projects/summary?today=${today}`, listProjectSummariesResponseSchema).then((res) => res.data),
    enabled: organizationId !== "",
    refetchOnMount: "always",
  });
}
