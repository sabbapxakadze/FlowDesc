import { useEffect, useRef } from "react";
import type { Sprint } from "@flowdesc/contracts";
import { EmptyState, ErrorText, Skeleton } from "../../../shared/ui";
import { SprintCard, type SprintCounts, type SprintOutcome } from "./SprintCard";

/**
 * All of the project's sprints as a row of cards, oldest to newest (ADR 0065), so the story of the project reads left to right and the planned
 * sprint waits at the end. The row scrolls sideways when there are more cards than room, and opens scrolled to the active sprint (or to the end),
 * so the sprint that matters now is in view. A `ul` named "Sprints": each card is a list item.
 */
export function SprintStrip({
  organizationId,
  projectId,
  sprints,
  pending,
  today,
  counts,
  outcomes,
  startingId,
  onStart,
  startError,
}: {
  organizationId: string;
  projectId: string;
  sprints: Sprint[] | undefined;
  pending: boolean;
  today: string;
  counts: SprintCounts & { total: number };
  outcomes: Map<string, SprintOutcome>;
  /** The sprint a Start is in flight for, or null. */
  startingId: string | null;
  onStart: (sprint: Sprint) => void;
  startError: string | null;
}) {
  const row = useRef<HTMLUListElement>(null);
  const hasActive = sprints?.some((sprint) => sprint.status === "active") ?? false;
  const ordered = [...(sprints ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const count = ordered.length;

  // Scrolled to the active sprint (or the newest) once the cards are there. Only the row scrolls: block "nearest" leaves the page where it is.
  useEffect(() => {
    if (count === 0) return;
    const target = row.current?.querySelector("[data-active-sprint]") ?? row.current?.lastElementChild;
    target?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [count]);

  if (pending) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
    );
  }
  if (count === 0) {
    return <EmptyState block>No sprints yet. Create one with New sprint, then start it when the team is ready to plan.</EmptyState>;
  }

  return (
    <>
      <ul ref={row} aria-label="Sprints" className="scrollbar-list-always grid auto-cols-[minmax(11rem,1fr)] grid-flow-col gap-3 overflow-x-auto pb-1">
        {ordered.map((sprint) => (
          <SprintCard
            key={sprint.id}
            organizationId={organizationId}
            projectId={projectId}
            sprint={sprint}
            today={today}
            counts={counts}
            outcome={outcomes.get(sprint.id)}
            canStart={!hasActive}
            startPending={startingId === sprint.id}
            onStart={() => onStart(sprint)}
          />
        ))}
      </ul>
      {startError && <ErrorText>{startError}</ErrorText>}
    </>
  );
}
