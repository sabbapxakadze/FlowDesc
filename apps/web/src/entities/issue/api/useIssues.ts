import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchIssues } from "./fetchIssues";
import { issueKeys, type IssueListFilters } from "./queryKeys";

/**
 * Cursor pagination via TanStack Query's built-in useInfiniteQuery, not a
 * hand-rolled "page" state: getNextPageParam reads the server's opaque
 * nextCursor directly, and a null nextCursor is what tells TanStack there's
 * no further page — no separate hasMore bookkeeping needed on this side.
 *
 * filters (status/order) are part of the query key — changing either is a
 * different cache entry, so useInfiniteQuery naturally starts back at a
 * fresh first page with no manual cursor-reset code needed. See
 * queryKeys.ts for why that doesn't break CreateIssueForm/EditIssueForm's
 * existing unfiltered invalidation calls.
 */
export function useIssues(organizationId: string, projectId: string, filters: IssueListFilters = {}, options: { enabled?: boolean } = {}) {
  return useInfiniteQuery({
    enabled: options.enabled ?? true,
    queryKey: issueKeys.list(projectId, filters),
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      fetchIssues(organizationId, projectId, { ...filters, cursor: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}
