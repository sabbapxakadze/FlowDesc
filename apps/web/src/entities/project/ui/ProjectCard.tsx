import { Link } from "react-router";
import type { ProjectSummary } from "@flowdesc/contracts";
import { projectPath } from "../../../shared/lib/paths";
import { Card, cn, Skeleton, Time, type RowState } from "../../../shared/ui";
import { projectInitials, sprintTimeLeft } from "../lib/projectCard";
import type { Project } from "../model";

const MUTED = "text-[var(--color-text-muted)]";

/**
 * A project on the Projects page (owner's pick A, ADR 0059): a tile with the project's initials, its name and key, how much is done as a bar,
 * the open / in progress / overdue counts, and the running sprint with the days left. One accent for every project (no per-project colours); red
 * only for "overdue". The numbers come from `summary`, which arrives a moment after the project list: until then the card shows quiet placeholders.
 */
export function ProjectCard({
  project,
  summary,
  today,
  rowState,
  rowIndex,
}: {
  project: Project;
  /** Undefined while the numbers are loading. */
  summary?: ProjectSummary;
  /** The person's own calendar day, for "days left". */
  today: string;
  /** Motion of a row in a useAnimatedList list (see Card). */
  rowState?: RowState;
  rowIndex?: number;
}) {
  const percent = summary && summary.total > 0 ? Math.round((summary.done / summary.total) * 100) : null;
  const sprint = summary?.activeSprint ?? null;
  const left = sprint ? sprintTimeLeft(sprint.endDate, today) : null;
  return (
    <Card as="li" hoverable rowState={rowState} rowIndex={rowIndex} className="p-0">
      <Link to={projectPath(project.key)} className="flex h-full flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-card)] border border-[color-mix(in_oklab,var(--color-accent-500)_40%,transparent)] bg-[color-mix(in_oklab,var(--color-accent-500)_16%,transparent)] text-xs font-semibold text-[var(--color-text-link)]"
          >
            {projectInitials(project.name, project.key)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{project.name}</p>
            <p className={cn("truncate text-xs", MUTED)}>
              {summary === undefined ? "\u00a0" : summary.lastChangeAt ? <>Updated <Time iso={summary.lastChangeAt} /></> : "No activity yet"}
            </p>
          </div>
          <span className={cn("rounded-full border border-[var(--color-border-input)] px-2 py-0.5 text-xs font-medium", MUTED)}>{project.key}</span>
        </div>

        {summary === undefined ? (
          <div className="flex flex-col gap-3" aria-hidden="true">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ) : summary.total === 0 ? (
          <p className={cn("text-xs", MUTED)}>No issues yet.</p>
        ) : (
          <>
            <div>
              <div className="mb-1 flex items-baseline justify-between text-xs">
                <span className={MUTED}>
                  {summary.done} of {summary.total} done
                </span>
                <span className="font-semibold">{percent}%</span>
              </div>
              <div
                role="progressbar"
                aria-label={`${project.name}: ${percent}% done`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent ?? 0}
                className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-bg-lane)]"
              >
                <div className="h-full rounded-full bg-[var(--color-chart-primary)]" style={{ width: `${percent}%` }} />
              </div>
            </div>
            <p className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
              <span>
                <span className="font-semibold">{summary.open}</span> <span className={MUTED}>open</span>
              </span>
              <span>
                <span className="font-semibold">{summary.inProgress}</span> <span className={MUTED}>in progress</span>
              </span>
              <span className={summary.overdue > 0 ? "font-medium text-[var(--color-text-danger)]" : MUTED}>{summary.overdue} overdue</span>
            </p>
          </>
        )}

        {summary !== undefined && (
          <div className="mt-auto border-t border-[var(--color-border-default)] pt-2.5">
            {sprint ? (
              <span className="rounded-full bg-[color-mix(in_oklab,var(--color-accent-500)_16%,transparent)] px-2 py-0.5 text-xs font-medium">
                {sprint.name}
                {left && <span className={MUTED}> &middot; {left}</span>}
              </span>
            ) : (
              <span className={cn("text-xs", MUTED)}>No active sprint</span>
            )}
          </div>
        )}
      </Link>
    </Card>
  );
}
