import { memo, type MouseEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { IssueListItem } from "@flowdesc/contracts";
import { issueKey, issuePath } from "../../../shared/lib/paths";
import { pointerListeners, useDragClickGuard } from "../lib/dragHelpers";
import { openIssueOnClick } from "../lib/issueLinkClick";
import { DragHandle } from "./DragHandle";
import { IssueCardContent, IssueCardFrame } from "./IssueCardFace";

/**
 * An issue card that is sortable inside a list (the board's columns, the sprints page's backlog and
 * active sprint; renamed from BoardCard when the sprints page got the same ordering), draggable from
 * anywhere on the card via useSortable, and still a link.
 *
 * - The pointer listeners sit on the wrapper <li>, so grabbing the card body
 *   drags it; a plain click never reaches dnd-kit's activation distance and
 *   navigates as usual. The grip button keeps the full listeners (including
 *   the keyboard ones), which is what makes Tab, Space, arrows, Space work.
 * - History: an earlier version put the listeners on the card and the title
 *   link and a completed drag navigated to the issue, because the browser's
 *   click after a drag landed on the link. `useDragClickGuard` cancels exactly
 *   that click, and `draggable={false}` stops the browser's own native
 *   link-drag from competing with dnd-kit.
 * - The sortable transform/transition live on the <li>, and the Card inside
 *   keeps its own transition-shadow, so the hover shadow still animates
 *   (an inline `transition` on the Card itself would replace it).
 * - Speed (2026-10-05): dnd-kit re-renders EVERY sortable item on every drag-over event (2,000+ card renders in one
 *   drag with 80 cards, a 250 ms hitch at the start and at the drop). Only the thin <li> follows dnd-kit now; the card
 *   body is memoised and receives props that keep their identity between renders (hence `assigneeId` plus a stable
 *   `renderAssignee` instead of a ready-made element, which would be new on every render).
 */
export function SortableIssueCard({
  issue,
  projectKey,
  assigneeId,
  renderAssignee,
  renderLabels,
  onOpen,
  dragLabel = "Drag to reorder or move",
}: {
  issue: IssueListItem;
  projectKey: string;
  /** Who it is assigned to; `renderAssignee` turns the id into the picture. */
  assigneeId?: string | null;
  /** Builds the assignee's picture (a profile link with a hover card) for an id. It must keep its identity between renders
   *  (useCallback) or the memoised card body re-renders on every drag event. Beside the issue link, never inside it. */
  renderAssignee?: (userId: string) => ReactNode;
  /** Builds the label pills from the issue's labels (entities cannot import each other, so the page supplies it). Like
   *  `renderAssignee` it must keep its identity between renders. */
  renderLabels?: (labels: IssueListItem["labels"]) => ReactNode;
  /** Open the issue in the side panel instead of navigating (modified clicks still navigate). */
  onOpen?: (issueId: string) => void;
  /** The grip button's accessible name. */
  dragLabel?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: issue.id,
  });
  const guardClick = useDragClickGuard(isDragging);

  return (
    <li
      data-tour="issue-card"
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? "opacity-40" : ""}
      {...pointerListeners(listeners)}
    >
      <SortableCardBody
        issue={issue}
        projectKey={projectKey}
        assigneeId={assigneeId}
        renderAssignee={renderAssignee}
        renderLabels={renderLabels}
        onOpen={onOpen}
        dragLabel={dragLabel}
        attributes={attributes}
        listeners={listeners}
        guardClick={guardClick}
      />
    </li>
  );
}

const SortableCardBody = memo(function SortableCardBody({
  issue,
  projectKey,
  assigneeId,
  renderAssignee,
  renderLabels,
  onOpen,
  dragLabel,
  attributes,
  listeners,
  guardClick,
}: {
  issue: IssueListItem;
  projectKey: string;
  assigneeId?: string | null;
  renderAssignee?: (userId: string) => ReactNode;
  renderLabels?: (labels: IssueListItem["labels"]) => ReactNode;
  onOpen?: (issueId: string) => void;
  dragLabel: string;
  attributes: ReturnType<typeof useSortable>["attributes"];
  listeners: ReturnType<typeof useSortable>["listeners"];
  guardClick: (event: MouseEvent) => void;
}) {
  return (
    <IssueCardFrame priority={issue.priority} className="select-none">
      <DragHandle aria-label={dragLabel} {...attributes} {...listeners} />
      <Link
        to={issuePath(projectKey, issue.number)}
        draggable={false}
        data-panel-trigger
        onClick={(event) => {
          guardClick(event);
          openIssueOnClick(event, onOpen, issueKey(projectKey, issue.number));
        }}
        className="block min-w-0 flex-1"
      >
        <IssueCardContent issue={issue} projectKey={projectKey} labels={renderLabels?.(issue.labels)} />
      </Link>
      {assigneeId && renderAssignee && <span className="shrink-0">{renderAssignee(assigneeId)}</span>}
    </IssueCardFrame>
  );
});
