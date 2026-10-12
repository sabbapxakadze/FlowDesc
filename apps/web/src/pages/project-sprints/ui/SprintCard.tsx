import { useState } from "react";
import type { Sprint } from "@flowdesk/contracts";
import { SprintProgress, SprintStatusBadge } from "../../../entities/sprint";
import { DeleteSprintButton } from "../../../features/delete-sprint";
import { RenameSprintForm } from "../../../features/rename-sprint";
import { ActionMenu, Button, cn } from "../../../shared/ui";
import { sprintRange } from "../lib/sprintText";

export type SprintCounts = { done: number; inProgress: number; todo: number };
/** What a completed sprint took on and finished, as of the day it closed (ADR 0011). */
export type SprintOutcome = { committed: number; completed: number };

type Mode = "view" | "rename" | "delete";

/**
 * One sprint in the strip (ADR 0065). Its look says its state: a planned sprint is dashed and has Start, the active one is outlined and shows its
 * progress, a completed one is quiet and shows how many of its issues were done when it closed. Rename and Delete are in the "..." menu, not on
 * the card (Delete is not offered for the active sprint, and the API refuses it as well); choosing one swaps the card's body for the inline form.
 * Start is disabled while another sprint is active (a project has at most one), with the reason in its title.
 */
export function SprintCard({
  organizationId,
  projectId,
  sprint,
  today,
  counts,
  outcome,
  canStart,
  startPending,
  onStart,
}: {
  organizationId: string;
  projectId: string;
  sprint: Sprint;
  today: string;
  /** The status split of the active sprint's issues (only read when the sprint is active). */
  counts: SprintCounts & { total: number };
  outcome: SprintOutcome | undefined;
  canStart: boolean;
  startPending: boolean;
  onStart: () => void;
}) {
  const [mode, setMode] = useState<Mode>("view");
  const active = sprint.status === "active";
  const items = [
    { label: "Rename", onSelect: () => setMode("rename") },
    ...(active ? [] : [{ label: "Delete", tone: "danger" as const, onSelect: () => setMode("delete") }]),
  ];

  return (
    <li
      data-active-sprint={active ? "" : undefined}
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-[var(--radius-card)] border p-3",
        active && "border-[var(--color-border-focus)] bg-[var(--color-bg-surface)] shadow-sm ring-1 ring-[var(--color-border-focus)]",
        sprint.status === "planned" && "border-dashed border-[var(--color-border-input)]",
        sprint.status === "completed" && "border-[var(--color-border-default)]",
      )}
    >
      {mode === "rename" ? (
        <RenameSprintForm
          organizationId={organizationId}
          projectId={projectId}
          sprint={sprint}
          onDone={() => setMode("view")}
          inputClassName="w-full min-w-0"
        />
      ) : mode === "delete" ? (
        <DeleteSprintButton organizationId={organizationId} projectId={projectId} sprint={sprint} startAsking onCancel={() => setMode("view")} />
      ) : (
        <>
          <div className="flex items-center justify-between gap-1">
            <p className={cn("min-w-0 truncate text-sm font-semibold", sprint.status === "completed" && "text-[var(--color-text-muted)]")} title={sprint.name}>
              {sprint.name}
            </p>
            <ActionMenu label={`${sprint.name} options`} items={items} />
          </div>
          <SprintStatusBadge status={sprint.status} />
          <p className="text-xs text-[var(--color-text-muted)]">{sprintRange(sprint.startDate, sprint.endDate, today)}</p>
          {active && (
            <>
              <SprintProgress done={counts.done} inProgress={counts.inProgress} todo={counts.todo} />
              <p className="text-xs text-[var(--color-text-muted)]">
                <b className="font-semibold text-[var(--color-text-default)]">{counts.done}</b> of {counts.total} done
              </p>
            </>
          )}
          {sprint.status === "completed" && outcome && (
            <p className="text-xs text-[var(--color-text-muted)]">
              <b className="font-semibold text-[var(--color-text-default)]">{outcome.completed}</b> of {outcome.committed} done
            </p>
          )}
          {sprint.status === "planned" && (
            <div className="mt-auto pt-1">
              <Button
                variant="secondary"
                size="sm"
                disabled={!canStart || startPending}
                title={canStart ? undefined : "A project has one active sprint at a time. Complete the active one first."}
                onClick={onStart}
              >
                Start sprint
              </Button>
            </div>
          )}
        </>
      )}
    </li>
  );
}
