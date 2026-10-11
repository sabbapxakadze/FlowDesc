import type { ReactNode } from "react";
import { useBreakdown, useCycleTime, useThroughput, useVelocity } from "../../entities/analytics";
import { Card, Skeleton } from "../../shared/ui";
import { MiniStack, RangeBar, SparkBars, SparkPairs } from "./MiniCharts";

/** One decimal when there is one, none otherwise: 18 stays "18", 1.5 stays "1.5". */
function plain(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

type Query = { isPending: boolean; isError: boolean };

/**
 * One headline: a label, a big number with its unit, a line saying what it is made of, and a small picture. Each tile reads its own data, so one
 * failing request does not blank the others: a tile that cannot load says so in its own place.
 */
function Tile({
  label,
  query,
  big,
  unit,
  sub,
  viz,
}: {
  label: string;
  query: Query;
  big: string;
  unit: string;
  sub: string;
  viz: ReactNode;
}) {
  return (
    <Card className="p-5">
      <p className="mb-2 text-xs text-[var(--color-text-muted)]">{label}</p>
      {query.isPending ? (
        <>
          <Skeleton className="h-9 w-28" />
          <Skeleton className="mt-3 h-4 w-40" />
        </>
      ) : query.isError ? (
        <p className="text-sm text-[var(--color-text-muted)]">Could not load this.</p>
      ) : (
        <>
          <div className="flex items-end justify-between gap-2">
            <p className="font-display text-4xl leading-none font-normal tabular-nums">
              {big}
              <small className="ml-1.5 font-sans text-sm text-[var(--color-text-muted)]">{unit}</small>
            </p>
            {viz}
          </div>
          <p className="mt-2 text-xs text-[var(--color-text-muted)]">{sub}</p>
        </>
      )}
    </Card>
  );
}

/**
 * The four headline numbers at the top of the analytics page (ADR 0064): what was completed, how long an issue typically takes, how a sprint usually
 * goes, and how much work is open. Every figure is one the charts below already show, or a sum, share or average of their data; no new request is
 * made (the hooks share the charts' cache, so the same data is fetched once).
 */
export function AnalyticsSummary({
  organizationId,
  projectId,
  weeks,
  sprints,
}: {
  organizationId: string;
  projectId: string;
  weeks: number;
  sprints: number;
}) {
  const throughput = useThroughput(organizationId, projectId, weeks);
  const cycle = useCycleTime(organizationId, projectId, weeks);
  const velocity = useVelocity(organizationId, projectId, sprints);
  const breakdown = useBreakdown(organizationId, projectId);

  const completed = throughput.data?.reduce((sum, point) => sum + point.completed, 0) ?? 0;
  const perWeek = throughput.data && throughput.data.length > 0 ? completed / throughput.data.length : 0;

  const median = cycle.data?.summary.medianDays ?? null;
  const p90 = cycle.data?.summary.p90Days ?? null;

  const sprintRows = velocity.data?.data ?? [];
  const average = velocity.data?.summary.averageCompleted ?? null;
  const finished = sprintRows.reduce((sum, row) => sum + row.completed, 0);
  const committed = sprintRows.reduce((sum, row) => sum + row.committed, 0);

  const countOf = (status: string) => breakdown.data?.byStatus.find((row) => row.status === status)?.count ?? 0;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Tile
        label="Completed"
        query={throughput}
        big={String(completed)}
        unit={completed === 1 ? "issue" : "issues"}
        sub={`in ${weeks} weeks, ${plain(perWeek)} a week`}
        viz={<SparkBars values={throughput.data?.map((point) => point.completed) ?? []} />}
      />
      <Tile
        label="Typical cycle time"
        query={cycle}
        big={median === null ? "-" : plain(median)}
        unit={median === null ? "" : median === 1 ? "day" : "days"}
        sub={p90 === null ? "No issue has gone from in progress to done yet" : `9 in 10 done within ${plain(p90)} days`}
        viz={median === null ? null : <RangeBar median={median} p90={p90} />}
      />
      <Tile
        label="Sprint velocity"
        query={velocity}
        big={average === null ? "-" : plain(average)}
        unit={average === null ? "" : "a sprint"}
        sub={sprintRows.length === 0 ? "No sprint has been completed yet" : `${finished} of ${committed} committed issues finished`}
        viz={sprintRows.length === 0 ? null : <SparkPairs rows={sprintRows} />}
      />
      <Tile
        label="Open now"
        query={breakdown}
        big={String(breakdown.data?.openTotal ?? 0)}
        unit={breakdown.data?.openTotal === 1 ? "issue" : "issues"}
        sub={`${countOf("in_progress")} in progress, ${countOf("todo")} to do`}
        viz={<MiniStack inProgress={countOf("in_progress")} todo={countOf("todo")} />}
      />
    </div>
  );
}
