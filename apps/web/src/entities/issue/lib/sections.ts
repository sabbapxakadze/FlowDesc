import type { IssueStatus, ProjectSummary } from "@flowdesc/contracts";

/**
 * The Issues list is grouped by status (ADR 0072). These are the rules for which groups there are and what their numbers say, kept apart
 * from the components so they can be tested without a page.
 */

/** Top to bottom: what is being worked on first, what is waiting next, what is finished last. */
export const SECTION_ORDER: IssueStatus[] = ["in_progress", "todo", "done"];

export interface SectionPlan {
  /** The groups to draw, in order. A single group (a status tab) is drawn flat, without its header. */
  show: IssueStatus[];
  flat: boolean;
  /** Which groups load their issues now. Finished work is loaded only when its group is open (or it is the only one shown). */
  enabled: Record<IssueStatus, boolean>;
}

export function sectionPlan(status: IssueStatus | undefined, doneOpen: boolean): SectionPlan {
  if (status) {
    return {
      show: [status],
      flat: true,
      enabled: { in_progress: status === "in_progress", todo: status === "todo", done: status === "done" },
    };
  }
  return { show: SECTION_ORDER, flat: false, enabled: { in_progress: true, todo: true, done: doneOpen } };
}

/**
 * The exact number of issues with a status, from the project's summary (`open` is everything not done, so Todo is what is left after
 * In progress). Only true while no other filter is on: with a filter the summary still counts the whole project.
 */
export function summaryCount(summary: Pick<ProjectSummary, "open" | "inProgress" | "done">, status: IssueStatus): number {
  if (status === "in_progress") return summary.inProgress;
  if (status === "done") return summary.done;
  return summary.open - summary.inProgress;
}

/** A group's number when it is not exact: what has been loaded, and a "+" while there is another page. */
export function loadedCountLabel(loaded: number, hasNextPage: boolean): string {
  return `${loaded}${hasNextPage ? "+" : ""}`;
}
