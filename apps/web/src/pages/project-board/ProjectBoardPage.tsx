import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  useDroppable,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { IssueListItem, IssueStatus } from "@flowdesc/contracts";
import { useCurrentProject } from "../../entities/project";
import { LabelPills } from "../../entities/label";
import { AssigneeAvatar } from "../../entities/member";
import { IssueCardContent, IssueCardFrame, SortableIssueCard, useBoard, useLiveIssueUpdates } from "../../entities/issue";
import { NewIssueButton } from "../../features/create-issue";
import { useMoveIssue } from "../../features/move-issue";
import { IssuePanel, useIssuePanel } from "../../widgets/issue-detail";
import { ProjectViewTabs } from "../../widgets/project-view-tabs";
import { useAuth } from "../../shared/auth/useAuth";
import { createMultiList, useMultiListCollision, type ListMap } from "../../shared/dnd/multiList";
import { useDragSensors } from "../../shared/dnd/sensors";
import {
  Card,
  ColumnHeader,
  EmptyState,
  ErrorText,
  Lane,
  Page,
  PageHeader,
  Skeleton,
  STATUS_LABELS,
} from "../../shared/ui";

const COLUMNS: IssueStatus[] = ["todo", "in_progress", "done"];

/** Issue ids per column, in display order. */
type ColumnMap = ListMap<IssueStatus>;

// The drag model (lists, hovering, collision) is shared with the sprints page: shared/dnd/multiList.
const { isListId: isColumnId, findContainer, moveAcrossLists: moveAcrossColumns } = createMultiList(COLUMNS);

function buildColumns(issues: IssueListItem[] | undefined): ColumnMap {
  const map: ColumnMap = { todo: [], in_progress: [], done: [] };
  for (const issue of issues ?? []) map[issue.status].push(issue.id);
  return map;
}

/**
 * The drag in progress, or just finished and waiting for the server's optimistic
 * update to land. `columns` is the live preview (the dragged card already moved
 * into the column being hovered, so the cards there slide apart to make room).
 */
type DragState = {
  columns: ColumnMap;
  dragging: boolean;
  /** The board array at the moment of the drop, to tell when the cache changed. */
  issuesAtDrop: IssueListItem[] | undefined;
};

function ColumnSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: 2 }, (_, i) => (
        <Card key={i}>
          <Skeleton className="mb-2 h-3 w-16" />
          <Skeleton className="h-4 w-32" />
        </Card>
      ))}
    </div>
  );
}

/**
 * One droppable for the whole column: header, cards and the empty space below,
 * so a card can be dropped anywhere in the column, not only on the cards list.
 * The column is a Lane (a panel a shade apart from the page, header fixed, cards
 * scrolling inside). `highlighted` marks the column that currently holds the
 * dragged card. Each card inside is its own sortable target ("insert here"); the
 * page's collision detection maps the column itself to its nearest card.
 */
function BoardColumn({
  status,
  itemIds,
  highlighted,
  dragging,
  header,
  children,
}: {
  status: IssueStatus;
  itemIds: string[];
  highlighted: boolean;
  /** A card is being dragged: the lane keeps at least the height it had when the drag began. */
  dragging: boolean;
  header: ReactNode;
  children: ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: status });
  return (
    <Lane
      ref={setNodeRef}
      label={STATUS_LABELS[status]}
      highlighted={highlighted}
      freezeHeight={dragging}
      header={header}
    >
      <SortableContext items={itemIds} strategy={verticalListSortingStrategy}>
        {children}
      </SortableContext>
    </Lane>
  );
}

/**
 * No dedicated "get one project" fetch, same reasoning as
 * ProjectDetailPage: reuses the cached org-wide project list.
 *
 * Drag model (ADR 0018): the whole card is the drag source; while dragging, a
 * local copy of the columns (`drag.columns`) is updated on every dragover so the
 * card really moves into the hovered column and the cards there make room; the
 * drop then sends the final neighbours to the existing move endpoint.
 */
/** The label pills on a card. A module-level function, so its identity never changes and the memoised card bodies stay put while dragging. */
const renderLabels = (labels: IssueListItem["labels"]) => <LabelPills labels={labels} variant="outline" className="" />;

export function ProjectBoardPage() {
  const { organization } = useAuth();
  // Stable (only changes with the organization): the memoised card bodies must not be re-rendered by a new function.
  const organizationId = organization!.id;
  const renderAssignee = useCallback(
    (userId: string) => <AssigneeAvatar organizationId={organizationId} userId={userId} />,
    [organizationId],
  );
  const panel = useIssuePanel();
  const project = useCurrentProject();
  const projectId = project.id;

  const { data: issues, isPending: issuesPending, isError, error } = useBoard(organization!.id, projectId);
  const moveMutation = useMoveIssue(organization!.id, projectId);
  useLiveIssueUpdates(projectId);

  const [activeIssue, setActiveIssue] = useState<IssueListItem | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const baseColumns = useMemo(() => buildColumns(issues), [issues]);
  const byId = useMemo(() => new Map((issues ?? []).map((issue) => [issue.id, issue])), [issues]);

  // Keep showing the preview while dragging, and after the drop until the
  // optimistic cache update has landed (the board array changes), so the old
  // layout never flashes between the drop and that update. On error the cache
  // is rolled back, the mutation stops being pending, and the real layout shows.
  const showPreview =
    drag !== null && (drag.dragging || (moveMutation.isPending && issues === drag.issuesAtDrop));
  const columns = showPreview ? drag.columns : baseColumns;

  // A grabbing cursor for the whole page while a card is being dragged.
  useEffect(() => {
    if (!activeIssue) return;
    document.body.style.cursor = "grabbing";
    return () => {
      document.body.style.cursor = "";
    };
  }, [activeIssue]);

  // distance 6: a plain click stays under it and navigates via the card's
  // <Link>; touch needs a short press so scrolling the page still works.
  const sensors = useDragSensors();

  const { collisionDetection, insertedNextToRef, resetGuards } = useMultiListCollision(columns, isColumnId);

  function handleDragStart(event: DragStartEvent) {
    setActiveIssue(byId.get(String(event.active.id)) ?? null);
    setDrag({ columns: baseColumns, dragging: true, issuesAtDrop: undefined });
    resetGuards();
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const activeId = String(active.id);

    if (drag && findContainer(drag.columns, activeId) !== findContainer(drag.columns, over.id)) {
      insertedNextToRef.current = isColumnId(over.id) ? null : over.id;
    }
    setDrag((previous) =>
      previous
        ? { ...previous, columns: moveAcrossColumns(previous.columns, activeId, over, active.rect.current.translated) }
        : previous,
    );
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveIssue(null);
    resetGuards();

    const activeId = String(active.id);
    const dragged = byId.get(activeId);
    if (!drag || !dragged || !over) {
      setDrag(null); // dropped outside every column: nothing changes
      return;
    }

    let finalColumns = drag.columns;
    const target = findContainer(finalColumns, activeId);
    if (!target) {
      setDrag(null);
      return;
    }

    // Same-column reorder: dnd-kit's sortable decides the final index.
    if (!isColumnId(over.id) && findContainer(finalColumns, over.id) === target) {
      const ids = finalColumns[target];
      const from = ids.indexOf(activeId);
      const to = ids.indexOf(String(over.id));
      if (from !== -1 && to !== -1 && from !== to) {
        finalColumns = { ...finalColumns, [target]: arrayMove(ids, from, to) };
      }
    }

    const ids = finalColumns[target];
    const index = ids.indexOf(activeId);
    const prevIssueId = ids[index - 1];
    const nextIssueId = ids[index + 1];

    const original = baseColumns[dragged.status];
    const originalIndex = original.indexOf(activeId);
    const unchanged =
      target === dragged.status &&
      original[originalIndex - 1] === prevIssueId &&
      original[originalIndex + 1] === nextIssueId;
    if (unchanged) {
      setDrag(null);
      return;
    }

    setDrag({ columns: finalColumns, dragging: false, issuesAtDrop: issues });
    moveMutation.mutate({
      issueId: dragged.id,
      version: dragged.version,
      status: target,
      prevIssueId,
      nextIssueId,
    });
  }

  function handleDragCancel() {
    setActiveIssue(null);
    setDrag(null);
    resetGuards();
  }

  const activeContainer = activeIssue ? findContainer(columns, activeIssue.id) : undefined;

  return (
    <Page width="wide">
      {/* From sm up the board fills the window: the page does not scroll, each column does (the 4rem is the
          Page's own vertical padding). On a phone the columns stack and the page scrolls as usual. */}
      <div className="flex flex-col sm:h-[calc(100dvh-4rem)] sm:min-h-[28rem]">
      <PageHeader eyebrow={project.name} title="Board" aside={<ProjectViewTabs projectKey={project.key} panelOpen={Boolean(panel.issueRef)} />} />

      <div className="mt-4 mb-3 flex items-center">
        <NewIssueButton organizationId={organizationId} projectId={project.id} />
      </div>

      {isError ? (
        <ErrorText>Failed to load the board: {error.message}</ErrorText>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={collisionDetection}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <div data-tour="board-columns" className="grid grid-cols-1 gap-4 sm:min-h-0 sm:flex-1 sm:grid-cols-3 sm:grid-rows-[minmax(0,1fr)]">
            {COLUMNS.map((status) => {
              const ids = columns[status];
              const columnIssues = ids.flatMap((id) => {
                const issue = byId.get(id);
                return issue ? [issue] : [];
              });
              return (
                <BoardColumn
                  key={status}
                  status={status}
                  itemIds={ids}
                  highlighted={activeContainer === status}
                  dragging={activeIssue !== null}
                  header={<ColumnHeader status={status} count={issuesPending ? undefined : ids.length} />}
                >
                  {issuesPending ? (
                    <ColumnSkeleton />
                  ) : columnIssues.length > 0 ? (
                    <ul className="flex flex-col gap-2">
                      {columnIssues.map((issue) => (
                        <SortableIssueCard
                          key={issue.id}
                          issue={issue}
                          projectKey={project.key}
                          assigneeId={issue.assigneeId}
                          renderAssignee={renderAssignee}
                          renderLabels={renderLabels}
                          onOpen={panel.open}
                        />
                      ))}
                    </ul>
                  ) : (
                    <EmptyState block>No issues</EmptyState>
                  )}
                </BoardColumn>
              );
            })}
          </div>

          <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
            {activeIssue && (
              <IssueCardFrame priority={activeIssue.priority} hoverable={false} className="cursor-grabbing shadow-lg">
                <IssueCardContent issue={activeIssue} projectKey={project.key} labels={renderLabels(activeIssue.labels)} />
                {activeIssue.assigneeId && (
                  <span className="shrink-0">
                    <AssigneeAvatar organizationId={organization!.id} userId={activeIssue.assigneeId} interactive={false} />
                  </span>
                )}
              </IssueCardFrame>
            )}
          </DragOverlay>
        </DndContext>
      )}
      </div>
      <IssuePanel project={project} />
    </Page>
  );
}
