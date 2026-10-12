import type { ReactNode } from "react";
import type { IssueListItem } from "@flowdesc/contracts";
import { Card, DueDate, PriorityBadge, cn } from "../../../shared/ui";

/**
 * The look of an issue card on the board and on the sprints page, and of the preview that follows the pointer while one is
 * dragged (ADR 0037). Only the look lives here: the drag and link wiring stays in `SortableIssueCard`, which composes these.
 *
 * `IssueCardFrame`: the card with a colored edge at the left that says the priority at a glance. The edge is decoration: the
 * priority is also written in the footer (icon and word), so color is never the only signal. Priority "none" has no edge.
 * The colors are existing semantic tokens, so both themes follow.
 */
const EDGE: Record<IssueListItem["priority"], string | null> = {
  urgent: "bg-[var(--color-text-danger)]",
  high: "bg-[var(--color-text-warning)]",
  medium: "bg-[var(--color-text-muted)]",
  low: "bg-[var(--color-border-input)]",
  none: null,
};

export function IssueCardFrame({
  priority,
  className,
  hoverable = true,
  children,
}: {
  priority: IssueListItem["priority"];
  className?: string;
  hoverable?: boolean;
  children: ReactNode;
}) {
  const edge = EDGE[priority];
  return (
    <Card
      hoverable={hoverable}
      className={cn(
        "group relative flex items-start gap-2 overflow-hidden pl-7",
        className,
      )}
    >
      {edge && (
        <span
          aria-hidden="true"
          data-priority-edge={priority}
          className={cn("absolute inset-y-0 left-0 w-1", edge)}
        />
      )}
      {children}
    </Card>
  );
}

/**
 * What is inside the card: the key and the due date on the first line, the title, and a footer with the labels at the left and
 * the priority at the right (the footer is left out when there is neither). The assignee's picture is not here: it is a profile
 * link, which cannot sit inside the issue link this content goes into, so the caller places it beside.
 */
export function IssueCardContent({
  issue,
  projectKey,
  labels,
}: {
  issue: Pick<
    IssueListItem,
    "number" | "title" | "priority" | "dueDate" | "status" | "labels"
  >;
  projectKey: string;
  /** The label tags, built by the page (entities cannot import each other). */
  labels?: ReactNode;
}) {
  const hasFooter = issue.labels.length > 0 || issue.priority !== "none";
  return (
    <div className="min-w-0 flex-1">
      <p className="flex min-h-5 items-center gap-2 text-xs text-[var(--color-text-muted)]">
        {projectKey}-{issue.number}
        <DueDate dueDate={issue.dueDate} done={issue.status === "done"} />
      </p>
      <p className="font-medium [overflow-wrap:anywhere]">{issue.title}</p>
      {hasFooter && (
        <div className="mt-2 flex items-end justify-between gap-2">
          <div className="min-w-0">{labels}</div>
          <PriorityBadge priority={issue.priority} />
        </div>
      )}
    </div>
  );
}
