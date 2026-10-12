import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getIssueResponseSchema } from "@flowdesc/contracts";
import { apiGet } from "../../../shared/api/client";
import { issueKeys } from "./queryKeys";

/**
 * An issue by its per-project number (the 12 of WEB-12), which is how a readable address becomes an issue
 * (ADR 0030). `number` null means "not asked yet" (the query stays off). A success also seeds the normal
 * single-issue cache entry, so the issue page that renders next does not fetch the same issue again.
 */
export function useIssueByNumber(organizationId: string, projectId: string, number: number | null) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: issueKeys.byNumber(projectId, number ?? 0),
    queryFn: async () => {
      const issue = await apiGet(
        `/v1/organizations/${organizationId}/projects/${projectId}/issues/by-number/${number}`,
        getIssueResponseSchema,
      ).then((res) => res.data);
      queryClient.setQueryData(issueKeys.detail(issue.id), issue);
      return issue;
    },
    enabled: number !== null,
    // A 404 is an answer (the issue is gone or never existed), not a reason to retry.
    retry: false,
  });
}
