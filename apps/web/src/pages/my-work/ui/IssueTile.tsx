import { Link } from "react-router";
import type { AssignedIssue, IssuePriority } from "@flowdesc/contracts";
import { issuePath } from "../../../shared/lib/paths";
import { openIssueOnClick } from "../../../entities/issue";
import { DueDate, PriorityBadge, StatusBadge } from "../../../shared/ui";

/** The coloured edge by priority, the same idea as the board's cards (ADR 0037). */
const EDGE: Record<IssuePriority, string> = {
  urgent: "var(--color-text-danger)",
  high: "var(--color-text-warning)",
  medium: "var(--color-accent-500)",
  low: "var(--color-text-muted)",
  none: "transparent",
};

/**
 * One of my issues on the My work page: key and project, title, status, priority and (when `showDue`) the due chip. The whole tile is the link to the issue.
 * A plain click opens the issue in the side panel (ADR 0025); Ctrl, Cmd, Shift or a middle click keeps the link, the full page. `data-panel-trigger` makes a click
 * on another tile swap the open panel instead of closing it.
 * The card's own colour with a thin border, in the week and in "Needs you today" alike: the "lane" colour is darker than a card in light mode and lighter
 * in dark mode, and read as a grey box on the white card.
 */
export function IssueTile({ issue, showDue = false, onOpen }: { issue: AssignedIssue; showDue?: boolean; onOpen: (issueKey: string) => void }) {
  return (
    <li
      className="rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] py-1.5 pr-2 pl-2.5"
      style={{ borderLeft: `3px solid ${EDGE[issue.priority]}` }}>
      <Link
        to={issuePath(issue.projectKey, issue.number)}
        data-panel-trigger
        onClick={(event) => openIssueOnClick(event, onOpen, `${issue.projectKey}-${issue.number}`)}
        className="block min-w-0"
      >
        <span className="block text-xs text-[var(--color-text-muted)]">
          {issue.projectKey}-{issue.number} &middot; {issue.projectName}
        </span>
        <span className="mt-0.5 block text-sm leading-snug font-medium [overflow-wrap:anywhere]">{issue.title}</span>
        <span className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <StatusBadge status={issue.status} />
          <span className="flex items-center gap-2">
            {showDue && <DueDate dueDate={issue.dueDate} done={false} />}
            <PriorityBadge priority={issue.priority} />
          </span>
        </span>
      </Link>
    </li>
  );
}
