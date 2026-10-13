import type { IssueStatus } from "@flowdesc/contracts";
import { useIssues } from "./useIssues";
import type { IssueListFilters } from "./queryKeys";
import { sectionPlan, type SectionPlan } from "../lib/sections";

/**
 * The Issues list grouped by status (ADR 0072): one `useIssues` per status, each with its own cursor and its own "Load more". The API pages
 * a project newest first with a `status` filter and no totals, so three small queries (all sharing the other filters and the sort) need no
 * change on the server, keep the existing pagination and live-update invalidation, and let the Done group load nothing while it is closed.
 *
 * The three hooks are always called (hooks cannot be conditional); the ones not needed are `enabled: false`.
 */
export function useIssueSections(
  organizationId: string,
  projectId: string,
  filters: Omit<IssueListFilters, "status">,
  status: IssueStatus | undefined,
  doneOpen: boolean,
) {
  const plan: SectionPlan = sectionPlan(status, doneOpen);
  const inProgress = useIssues(organizationId, projectId, { ...filters, status: "in_progress" }, { enabled: plan.enabled.in_progress });
  const todo = useIssues(organizationId, projectId, { ...filters, status: "todo" }, { enabled: plan.enabled.todo });
  const done = useIssues(organizationId, projectId, { ...filters, status: "done" }, { enabled: plan.enabled.done });
  const byStatus = { in_progress: inProgress, todo, done };

  const sections = plan.show.map((name) => {
    const query = byStatus[name];
    return {
      status: name,
      issues: query.data?.pages.flatMap((page) => page.data) ?? [],
      pageCount: query.data?.pages.length ?? 0,
      // Not loaded at all (a closed Done group) is "not pending": there is nothing to wait for.
      isPending: plan.enabled[name] && query.isPending,
      isError: query.isError,
      error: query.error,
      hasNextPage: query.hasNextPage,
      isFetchingNextPage: query.isFetchingNextPage,
      fetchNextPage: query.fetchNextPage,
      loaded: plan.enabled[name] && query.data !== undefined,
    };
  });
  // The newest time any of the shown groups was refreshed. The page watches it to re-read the project's summary (the exact tab counts).
  const updatedAt = Math.max(0, ...plan.show.map((name) => (plan.enabled[name] ? byStatus[name].dataUpdatedAt : 0)));
  return { plan, sections, updatedAt };
}
