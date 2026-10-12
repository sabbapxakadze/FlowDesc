import type { IssuePriority, IssueStatus } from "@flowdesc/contracts";
import { projectKeys } from "../../project";

export type IssueListFilters = {
  status?: IssueStatus;
  priority?: IssuePriority;
  /** "overdue" needs `today`, the caller's own calendar day ("YYYY-MM-DD"), so the list agrees with the overdue marker. */
  due?: "overdue" | "none";
  today?: string;
  // A user id or "unassigned".
  assignee?: string;
  /** Only issues that have ALL of these labels (ids). */
  labels?: string[];
  /** Omitted means by creation time. */
  sort?: "priority";
  order?: "asc" | "desc";
};

/**
 * Extends projectKeys.all rather than starting a fresh base array —
 * issues are nested under a project the same way the URL nests them,
 * so invalidating "all projects" data could reasonably cascade to issues
 * too. Same factory shape as entities/project/api/queryKeys.ts.
 *
 * list() takes an optional filters object — WITH filters, it's a distinct
 * cache entry per status/order combination (useIssues passes these so a
 * filtered view doesn't show another filter's cached pages). WITHOUT
 * filters, it returns the plain [..., projectId] key, which is a *prefix*
 * of every filtered variant's key — so existing
 * invalidateQueries({ queryKey: issueKeys.list(projectId) }) calls
 * (CreateIssueForm, EditIssueForm) keep invalidating every filtered
 * variant via TanStack's partial key matching, with no changes needed
 * there.
 */
export const issueKeys = {
  all: [...projectKeys.all, "issues"] as const,
  list: (projectId: string, filters?: IssueListFilters) =>
    filters ? ([...issueKeys.all, projectId, filters] as const) : ([...issueKeys.all, projectId] as const),
  // [...all, projectId, "board"] — [...all, projectId] (list() with no
  // filters) is still a prefix of this, so CreateIssueForm/EditIssueForm's
  // existing invalidateQueries({ queryKey: issueKeys.list(projectId) })
  // calls already invalidate the board too, same reasoning as list()'s
  // filtered variants above. No changes needed in either file.
  board: (projectId: string) => [...issueKeys.all, projectId, "board"] as const,
  // Same "list() with no filters is a prefix" reasoning as board — the
  // existing invalidateQueries({ queryKey: issueKeys.list(projectId) })
  // calls already invalidate this too.
  backlog: (projectId: string) => [...issueKeys.all, projectId, "backlog"] as const,
  detail: (issueId: string) => [...issueKeys.all, issueId] as const,
  // By per-project number (readable addresses, ADR 0030): under the project like list(), so the same invalidations reach it.
  byNumber: (projectId: string, number: number) => [...issueKeys.all, projectId, "number", number] as const,
  labels: (issueId: string) => [...issueKeys.all, issueId, "labels"] as const,
  events: (issueId: string) => [...issueKeys.all, issueId, "events"] as const,
  attachments: (issueId: string) => [...issueKeys.all, issueId, "attachments"] as const,
  // Org-scoped, not project-scoped — see issues.routes.ts's search route
  // and the Phase 7 slice 1 plan's "Decisions". Keyed by query too, so
  // typing a new search term is a distinct cache entry, not a stale hit.
  // Everything on the My work page (the assigned list and the week ring): one prefix, so one invalidation refreshes both.
  myWork: (organizationId: string) => ["organizations", organizationId, "my-work"] as const,
  search: (organizationId: string, query: string) => [...issueKeys.all, "search", organizationId, query] as const,
};
