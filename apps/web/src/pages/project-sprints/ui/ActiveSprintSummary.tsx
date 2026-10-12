import { useState } from "react";
import type { Sprint } from "@flowdesk/contracts";
import { SprintProgress, SprintStatusBadge } from "../../../entities/sprint";
import { sprintTimeLeft } from "../../../entities/project";
import { RenameSprintForm } from "../../../features/rename-sprint";
import { ActionMenu, Button, ErrorText } from "../../../shared/ui";
import { sentenceCase, sprintRange } from "../lib/sprintText";
import type { SprintCounts } from "./SprintCard";

/**
 * The head of the active sprint's lane (ADR 0065): its name, its dates and how much time is left (or that it ended, in the warning color: a
 * sprint is never completed by a date, so an old one waits for its Complete), the status split of its issues with the numbers printed, and the
 * one action that ends it. Completing sends EVERY issue of the sprint to the top of the backlog in the same order: the finished ones stay done,
 * the others keep their status (ADR 0008). The sprint itself stays, with how many issues it took on and finished (ADR 0011, the analytics).
 */
export function ActiveSprintSummary({
  organizationId,
  projectId,
  sprint,
  today,
  counts,
  total,
  completing,
  onComplete,
  error,
}: {
  organizationId: string;
  projectId: string;
  sprint: Sprint;
  today: string;
  counts: SprintCounts;
  total: number;
  completing: boolean;
  onComplete: () => void;
  error: string | null;
}) {
  const [renaming, setRenaming] = useState(false);
  const timeLeft = sprintTimeLeft(sprint.endDate, today);
  const ended = timeLeft?.startsWith("ended") ?? false;

  return (
    <div className="mb-2 rounded-[var(--radius-card)] bg-[var(--color-bg-surface)] p-3 shadow-sm">
      {renaming ? (
        <RenameSprintForm organizationId={organizationId} projectId={projectId} sprint={sprint} onDone={() => setRenaming(false)} />
      ) : (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h2 className="text-base font-semibold">{sprint.name}</h2>
          <SprintStatusBadge status="active" />
          <span className="text-xs text-[var(--color-text-muted)]">
            {sprintRange(sprint.startDate, sprint.endDate, today)}
            {timeLeft && (
              <>
                {" · "}
                <span className={ended ? "font-medium text-[var(--color-text-warning)]" : undefined}>{sentenceCase(timeLeft)}</span>
              </>
            )}
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <Button variant="secondary" size="sm" disabled={completing} onClick={onComplete}>
              Complete sprint
            </Button>
            <ActionMenu label={`${sprint.name} options`} items={[{ label: "Rename", onSelect: () => setRenaming(true) }]} />
          </span>
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <div className="min-w-32 flex-1">
          <SprintProgress done={counts.done} inProgress={counts.inProgress} todo={counts.todo} />
        </div>
        <p className="text-xs whitespace-nowrap text-[var(--color-text-muted)]">
          <b className="font-semibold text-[var(--color-text-default)]">{counts.done}</b> of {total} done · {counts.inProgress} in progress · {counts.todo} to do
        </p>
      </div>
      {error && <ErrorText className="mt-2">{error}</ErrorText>}
    </div>
  );
}
