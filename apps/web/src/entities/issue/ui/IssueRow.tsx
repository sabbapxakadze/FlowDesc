import type { ReactNode } from "react";
import { Link } from "react-router";
import { Pencil } from "lucide-react";
import { issueKey, issuePath } from "../../../shared/lib/paths";
import { Card, DueDate, IconButton, PriorityMark, type RowState } from "../../../shared/ui";
import type { Issue } from "../model";
import { openIssueOnClick } from "../lib/issueLinkClick";

/**
 * A row of the Issues list (ADR 0072, replacing the two-line rows of ADR 0036): one line, 40px, in groups by status. Left to right:
 * priority icon, key, title with its labels, due date, Edit, and the assignee in the LAST column. Every cell is placed in its own named
 * grid column, so a row without a due date or without an assignee leaves its cell empty instead of letting the next one slide left: the
 * assignee circle is at the same right edge in every row (an unassigned issue shows a dashed circle there).
 *
 * The layout follows the LIST's width (a container query: the page puts `@container` on the surface), not the window's, so the list also
 * stacks when the issue side panel narrows it. Narrow: the title and the assignee on the first line, key, due date and Edit under the title.
 * There is no Status column: the group (or the status tab) says it.
 */
const GRID = "grid-cols-[1.25rem_minmax(0,1fr)_1.75rem] @2xl:grid-cols-[1.25rem_4.25rem_minmax(0,1fr)_8rem_1.75rem_1.75rem]";

// Edit stays out of the way until you point at the row or tab into it, so a long list is not a column of buttons; on a touch
// screen (no hover) it is always visible. The same reveal the comment cards use.
const REVEAL =
  "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100";

/** The dashed circle that holds the assignee's place when nobody is assigned, the size of a photo (28px). */
function Unassigned() {
  return <span role="img" aria-label="Unassigned" title="Unassigned" className="inline-block h-7 w-7 rounded-full border border-dashed border-[var(--color-border-input)]" />;
}

/**
 * projectKey is passed in rather than looked up here: the issue itself only carries projectId, and the parent page already has
 * the project's key loaded (see pages/project-detail), so no extra fetch is needed just to render "AUTH-23".
 *
 * `onEdit` is a callback, so this stays presentational: entities cannot import features (FSD boundary), the page composes the
 * edit popup in. Same for `assignee` and `labels`, which the page builds (they are profile links and filter buttons: neither can sit
 * inside the issue link, since a link cannot hold another link or a button).
 */
export function IssueRow({
  issue,
  projectKey,
  assignee,
  labels,
  onEdit,
  onOpen,
  rowState,
  rowIndex,
}: {
  issue: Issue;
  projectKey: string;
  assignee?: ReactNode;
  labels?: ReactNode;
  onEdit?: () => void;
  /** Open the issue in the side panel instead of navigating (modified clicks still navigate). */
  onOpen?: (issueId: string) => void;
  /** Motion of a row in a useAnimatedList list (see Card). */
  rowState?: RowState;
  rowIndex?: number;
}) {
  const key = issueKey(projectKey, issue.number);
  return (
    <Card
      as="li"
      rowState={rowState}
      rowIndex={rowIndex}
      className={`group relative grid items-center gap-x-3 gap-y-1 rounded-none border-t border-[var(--color-border-default)] bg-transparent px-4 py-2 shadow-none first:border-t-0 hover:bg-[var(--color-border-default)]/40 @2xl:h-10 @2xl:py-0 ${GRID}`}
    >
      <span className="col-start-1 row-start-1 inline-flex justify-center">
        <PriorityMark priority={issue.priority} />
      </span>

      <div className="col-start-2 row-start-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 @2xl:col-start-3 @2xl:flex-nowrap">
        <Link
          to={issuePath(projectKey, issue.number)}
          data-panel-trigger
          onClick={(event) => openIssueOnClick(event, onOpen, key)}
          // A stretched link: this pseudo-element covers the whole row (the row is `relative`), so a click on any empty part of the row opens
          // the issue too. The controls that are not part of the link (labels, the assignee, Edit) sit above it with `relative z-10`.
          className="min-w-0 after:absolute after:inset-0"
        >
          <p className="font-medium [overflow-wrap:anywhere] @2xl:truncate">{issue.title}</p>
        </Link>
        {labels}
      </div>

      <div className="col-span-2 col-start-2 row-start-2 flex flex-wrap items-center gap-x-3 gap-y-1 @2xl:contents">
        <span className="text-xs text-[var(--color-text-muted)] tabular-nums @2xl:col-start-2 @2xl:row-start-1">{key}</span>
        <span className="@2xl:col-start-4 @2xl:row-start-1">
          <DueDate dueDate={issue.dueDate} done={issue.status === "done"} />
        </span>
        {onEdit && (
          <IconButton
            label="Edit"
            className={`relative z-10 ml-auto @2xl:col-start-5 @2xl:row-start-1 @2xl:ml-0 @2xl:justify-self-end ${REVEAL}`}
            onClick={onEdit}
          >
            <Pencil size={14} aria-hidden="true" />
          </IconButton>
        )}
      </div>

      <span className="relative z-10 col-start-3 row-start-1 justify-self-end @2xl:col-start-6">{assignee ?? <Unassigned />}</span>
    </Card>
  );
}
