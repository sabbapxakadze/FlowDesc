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
import type { GetBacklogResponse, IssueListItem } from "@flowdesc/contracts";
import { useVelocity } from "../../entities/analytics";
import { useCurrentProject } from "../../entities/project";
import { LabelPills } from "../../entities/label";
import { AssigneeAvatar } from "../../entities/member";
import { IssueCardContent, IssueCardFrame, SortableIssueCard, useBacklog } from "../../entities/issue";
import { IssuePanel, useIssuePanel } from "../../widgets/issue-detail";
import { useSprints } from "../../entities/sprint";
import { NewSprintButton } from "../../features/create-sprint";
import { useStartSprint, useCompleteSprint } from "../../features/manage-sprint";
import { useDragSensors } from "../../shared/dnd/sensors";
import { useAssignIssueSprint } from "../../features/assign-issue-sprint";
import { useAuth } from "../../shared/auth/useAuth";
import { todayKey } from "../../shared/lib/dueDate";
import { useTimezone } from "../../shared/lib/timezone";
import { createMultiList, useMultiListCollision, type ListMap } from "../../shared/dnd/multiList";
import { Button, Card, ColumnHeader, EmptyState, ErrorText, Lane, Page, PageHeader, Skeleton, Switch } from "../../shared/ui";
import { ActiveSprintSummary } from "./ui/ActiveSprintSummary";
import { SprintStrip } from "./ui/SprintStrip";

/**
 * The two lists a card can be dragged between and within: the backlog and the active sprint. The drag
 * model (lists, hovering, collision) is shared with the board: shared/dnd/multiList (ADR 0008, amended).
 */
const LISTS = ["backlog", "active-sprint"] as const;
type ListId = (typeof LISTS)[number];
type IssueLists = ListMap<ListId>;
const { isListId, findContainer, moveAcrossLists } = createMultiList(LISTS);

/** The label pills on a card. A module-level function, so its identity never changes and the memoised card bodies stay put while dragging. */
const renderLabels = (labels: IssueListItem["labels"]) => <LabelPills labels={labels} variant="outline" className="" />;

/**
 * The ids in each lane. Finished issues are left out of the backlog unless "Show done" is on (ADR 0065): completing a sprint sends every one of
 * its issues, the done ones too, to the top of the backlog, so without this the backlog fills with finished work. Only what is drawn is in the
 * list, so a drop position is always measured against cards on screen; the hidden ones stay where they are.
 */
function buildLists(data: GetBacklogResponse | undefined, showDone: boolean): IssueLists {
  return {
    backlog: (data?.backlog ?? []).filter((issue) => showDone || issue.status !== "done").map((issue) => issue.id),
    "active-sprint": (data?.activeSprintIssues ?? []).map((issue) => issue.id),
  };
}

/** The drag in progress, or just finished and waiting for the optimistic update to land (same as the board). */
type DragState = { lists: IssueLists; dragging: boolean; dataAtDrop: GetBacklogResponse | undefined };

function ListSkeleton() {
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
 * One list (backlog or active sprint): droppable on the whole lane, so a card can be dropped anywhere in it,
 * and a sortable context over its cards, so a card is dropped at an exact place (before or after a neighbour).
 */
function SprintList({
  id,
  itemIds,
  highlighted,
  dragging,
  header,
  children,
}: {
  id: ListId;
  itemIds: string[];
  highlighted: boolean;
  /** A card is being dragged: the lane keeps at least the height it had when the drag began. */
  dragging: boolean;
  header: ReactNode;
  children: ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id });
  return (
    <Lane
      ref={setNodeRef}
      label={id === "backlog" ? "Backlog" : "Active sprint"}
      tour={id === "backlog" ? "sprint-backlog" : "sprint-lane"}
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
 * ProjectBoardPage/ProjectDetailPage: reuses the cached org-wide project
 * list.
 */
export function ProjectSprintsPage() {
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
  const today = todayKey(useTimezone());

  const { data: sprints, isPending: sprintsPending } = useSprints(organizationId, projectId);
  // What each completed sprint took on and finished, as of its close (ADR 0011): the strip's cards say it. The velocity data covers the last 20.
  const { data: velocity } = useVelocity(organizationId, projectId, 20);
  const outcomes = useMemo(
    () => new Map((velocity?.data ?? []).map((row) => [row.sprintId, { committed: row.committed, completed: row.completed }])),
    [velocity],
  );
  const { data: backlogData, isPending: backlogPending, isError, error } = useBacklog(organizationId, projectId);
  const startMutation = useStartSprint(organizationId, projectId);
  const completeMutation = useCompleteSprint(organizationId, projectId);
  const assignMutation = useAssignIssueSprint(organizationId, projectId);
  const [showDone, setShowDone] = useState(false);

  const activeSprint = backlogData?.activeSprint ?? null;
  const byId = useMemo(
    () => new Map([...(backlogData?.backlog ?? []), ...(backlogData?.activeSprintIssues ?? [])].map((i) => [i.id, i])),
    [backlogData],
  );
  const baseLists = useMemo(() => buildLists(backlogData, showDone), [backlogData, showDone]);

  const sprintIssues = backlogData?.activeSprintIssues ?? [];
  const counts = {
    done: sprintIssues.filter((issue) => issue.status === "done").length,
    inProgress: sprintIssues.filter((issue) => issue.status === "in_progress").length,
    todo: sprintIssues.filter((issue) => issue.status === "todo").length,
    total: sprintIssues.length,
  };
  const backlogTotal = backlogData?.backlog.length ?? 0;
  const doneInBacklog = (backlogData?.backlog ?? []).filter((issue) => issue.status === "done").length;
  // The planned sprint to offer in the empty lane: the oldest one, the next in line.
  const nextPlanned = [...(sprints ?? [])].filter((sprint) => sprint.status === "planned").sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];

  const [activeIssue, setActiveIssue] = useState<IssueListItem | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  // Keep the preview while dragging and, after the drop, until the optimistic cache update has landed.
  const showPreview =
    drag !== null && (drag.dragging || (assignMutation.isPending && backlogData === drag.dataAtDrop));
  const lists = showPreview ? drag.lists : baseLists;

  // A grabbing cursor for the whole page while a card is being dragged.
  useEffect(() => {
    if (!activeIssue) return;
    document.body.style.cursor = "grabbing";
    return () => {
      document.body.style.cursor = "";
    };
  }, [activeIssue]);

  // distance 6 keeps a plain click a click; touch needs a short press so the page still scrolls.
  const sensors = useDragSensors();

  const { collisionDetection, insertedNextToRef, resetGuards } = useMultiListCollision(lists, isListId);

  function handleDragStart(event: DragStartEvent) {
    setActiveIssue(byId.get(String(event.active.id)) ?? null);
    setDrag({ lists: baseLists, dragging: true, dataAtDrop: undefined });
    resetGuards();
  }

  function handleDragOver({ active, over }: DragOverEvent) {
    if (!over) return;
    const activeId = String(active.id);
    // There is no sprint to drop into until one is active.
    if (over.id === "active-sprint" && !activeSprint) return;

    if (drag && findContainer(drag.lists, activeId) !== findContainer(drag.lists, over.id)) {
      insertedNextToRef.current = isListId(over.id) ? null : over.id;
    }
    setDrag((previous) =>
      previous
        ? { ...previous, lists: moveAcrossLists(previous.lists, activeId, over, active.rect.current.translated) }
        : previous,
    );
  }

  function handleDragEnd({ active, over }: DragEndEvent) {
    setActiveIssue(null);
    resetGuards();

    const activeId = String(active.id);
    const dragged = byId.get(activeId);
    if (!drag || !dragged || !over) {
      setDrag(null); // dropped outside both lists: nothing changes
      return;
    }

    let finalLists = drag.lists;
    const target = findContainer(finalLists, activeId);
    if (!target || (target === "active-sprint" && !activeSprint)) {
      setDrag(null);
      return;
    }

    // Same-list reorder: dnd-kit's sortable decides the final index.
    if (!isListId(over.id) && findContainer(finalLists, over.id) === target) {
      const ids = finalLists[target];
      const from = ids.indexOf(activeId);
      const to = ids.indexOf(String(over.id));
      if (from !== -1 && to !== -1 && from !== to) {
        finalLists = { ...finalLists, [target]: arrayMove(ids, from, to) };
      }
    }

    const ids = finalLists[target];
    const index = ids.indexOf(activeId);
    const prevIssueId = ids[index - 1];
    const nextIssueId = ids[index + 1];

    const originalTarget: ListId = dragged.sprintId === null ? "backlog" : "active-sprint";
    const original = baseLists[originalTarget];
    const originalIndex = original.indexOf(activeId);
    const unchanged =
      target === originalTarget &&
      original[originalIndex - 1] === prevIssueId &&
      original[originalIndex + 1] === nextIssueId;
    if (unchanged) {
      setDrag(null);
      return;
    }

    setDrag({ lists: finalLists, dragging: false, dataAtDrop: backlogData });
    assignMutation.mutate({
      issueId: dragged.id,
      version: dragged.version,
      sprintId: target === "backlog" ? null : activeSprint!.id,
      prevIssueId,
      nextIssueId,
    });
  }

  function handleDragCancel() {
    setActiveIssue(null);
    setDrag(null);
    resetGuards();
  }

  return (
    <Page width="wide">
      {/* From sm up the page fills the window: the sprint cards take one short row, and the two lists take the height that is left (ADR 0065).
          The page is never shorter than 40rem: the title, the row of sprints and the lists' own 16rem minimum (`Lane`) fit in it; with
          less, the lists hung out below the page and touched the bottom of the window with no space under them. A shorter window scrolls
          the page instead. The 4rem is the Page's own vertical padding. On a phone everything stacks at its natural height. */}
      <div className="flex flex-col sm:h-[calc(100dvh-4rem)] sm:min-h-[40rem]">
        <PageHeader
          eyebrow={project.name}
          title="Sprints"
          aside={
            <div className="pb-2">
              <NewSprintButton organizationId={organizationId} projectId={projectId} />
            </div>
          }
        />

        <section aria-label="Sprint overview" data-tour="sprint-strip" className="my-4 shrink-0">
          <SprintStrip
            organizationId={organizationId}
            projectId={projectId}
            sprints={sprints}
            pending={sprintsPending}
            today={today}
            counts={counts}
            outcomes={outcomes}
            startingId={startMutation.isPending ? startMutation.variables.sprintId : null}
            onStart={(sprint) => startMutation.mutate({ sprintId: sprint.id, version: sprint.version })}
            startError={startMutation.isError ? startMutation.error.message : null}
          />
        </section>

        {isError ? (
          <ErrorText>Failed to load the backlog: {error.message}</ErrorText>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={collisionDetection}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
          >
            <div className="grid grid-cols-1 gap-4 sm:min-h-0 sm:flex-1 sm:grid-cols-2 sm:grid-rows-[minmax(16rem,1fr)]">
              {LISTS.map((listId) => {
                const ids = lists[listId];
                const listIssues = ids.flatMap((id) => {
                  const issue = byId.get(id);
                  return issue ? [issue] : [];
                });
                const isSprint = listId === "active-sprint";
                const activeContainer = activeIssue ? findContainer(lists, activeIssue.id) : undefined;
                return (
                  <SprintList
                    key={listId}
                    id={listId}
                    itemIds={ids}
                    highlighted={activeContainer === listId}
                    dragging={activeIssue !== null}
                    header={
                      isSprint ? (
                        activeSprint ? (
                          <ActiveSprintSummary
                            organizationId={organizationId}
                            projectId={projectId}
                            sprint={activeSprint}
                            today={today}
                            counts={counts}
                            total={counts.total}
                            completing={completeMutation.isPending}
                            onComplete={() => completeMutation.mutate({ sprintId: activeSprint.id, version: activeSprint.version })}
                            error={completeMutation.isError ? completeMutation.error.message : null}
                          />
                        ) : (
                          <ColumnHeader label="Active sprint" />
                        )
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <ColumnHeader label="Backlog" count={backlogPending ? undefined : backlogTotal} />
                          {doneInBacklog > 0 && (
                            <Switch checked={showDone} onChange={setShowDone}>
                              Show done ({doneInBacklog})
                            </Switch>
                          )}
                        </div>
                      )
                    }
                  >
                    {backlogPending ? (
                      <ListSkeleton />
                    ) : isSprint && !activeSprint ? (
                      <EmptyState block as="div">
                        <p className="font-medium text-[var(--color-text-default)]">No sprint is running.</p>
                        <p className="mt-1">
                          {nextPlanned
                            ? `${nextPlanned.name} is planned. Start it, then drag issues in from the backlog.`
                            : "Create a sprint, then start it to plan work here."}
                        </p>
                        {nextPlanned && (
                          <Button
                            className="mt-3"
                            disabled={startMutation.isPending}
                            onClick={() => startMutation.mutate({ sprintId: nextPlanned.id, version: nextPlanned.version })}
                          >
                            Start {nextPlanned.name}
                          </Button>
                        )}
                      </EmptyState>
                    ) : listIssues.length > 0 ? (
                      <ul className="flex flex-col gap-2">
                        {listIssues.map((issue) => (
                          <SortableIssueCard
                            key={issue.id}
                            issue={issue}
                            projectKey={project.key}
                            assigneeId={issue.assigneeId}
                            renderAssignee={renderAssignee}
                            renderLabels={renderLabels}
                            onOpen={panel.open}
                            dragLabel="Drag to reorder or move between backlog and sprint"
                          />
                        ))}
                      </ul>
                    ) : (
                      <EmptyState block>{isSprint ? "No issues in this sprint yet. Drag some in from the backlog." : "Nothing open in the backlog."}</EmptyState>
                    )}
                    {!isSprint && !showDone && doneInBacklog > 0 && !backlogPending && (
                      <div className="mt-2">
                        <Button variant="link" onClick={() => setShowDone(true)}>
                          Show {doneInBacklog} done {doneInBacklog === 1 ? "issue" : "issues"}
                        </Button>
                      </div>
                    )}
                  </SprintList>
                );
              })}
            </div>

            <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
              {activeIssue && (
                <IssueCardFrame priority={activeIssue.priority} hoverable={false} className="cursor-grabbing shadow-lg">
                  <IssueCardContent issue={activeIssue} projectKey={project.key} labels={renderLabels(activeIssue.labels)} />
                  {activeIssue.assigneeId && (
                    <span className="shrink-0">
                      <AssigneeAvatar organizationId={organizationId} userId={activeIssue.assigneeId} interactive={false} />
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
