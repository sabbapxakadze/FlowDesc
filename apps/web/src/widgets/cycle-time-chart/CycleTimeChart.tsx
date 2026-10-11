import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCycleTime } from "../../entities/analytics";
import { AnchoredTooltip, Button, ChartCard, EmptyState, ErrorText, anchoredTooltipProps, Skeleton, WrappingTick } from "../../shared/ui";

type Bucket = { label: string; count: number };

function formatDays(days: number | null): string {
  if (days === null) return "-";
  return `${days} ${days === 1 ? "day" : "days"}`;
}

type TooltipProps = {
  active?: boolean;
  coordinate?: { x: number; y: number };
  payload?: ReadonlyArray<{ payload?: Bucket }>;
};

// Hand-built from semantic tokens, same reason as ThroughputChart's: the
// library default is a hardcoded white box that ignores dark mode.
function ChartTooltip({ active, coordinate, payload }: TooltipProps) {
  const bucket = payload?.[0]?.payload;
  if (!active || !bucket) return null;
  return (
    <AnchoredTooltip coordinate={coordinate} orientation="column">
      <div className="rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm shadow-sm">
        <p className="text-xs text-[var(--color-text-muted)]">{bucket.label}</p>
        <p className="font-medium">
          {bucket.count} {bucket.count === 1 ? "issue" : "issues"}
        </p>
      </div>
    </AnchoredTooltip>
  );
}

/**
 * Median leads, mean and p90 beside it: cycle times are skewed, so a mean
 * alone is dragged around by a few long-running issues (ADR 0010). The
 * median and the 90th percentile are the headline numbers in the summary
 * tiles above (ADR 0064); here the same figures, with the average and the
 * count, sit in one quiet line under the histogram. The count of issues that
 * finished without ever being in progress is shown, not hidden — they have
 * no cycle time, and silently dropping them would make the sample look
 * bigger than the work it describes.
 */
export function CycleTimeChart({
  organizationId,
  projectId,
  weeks,
}: {
  organizationId: string;
  projectId: string;
  weeks: number;
}) {
  const { data, isPending, isError, error } = useCycleTime(organizationId, projectId, weeks);
  const [showTable, setShowTable] = useState(false);
  const subtitle = "From first in progress to done";

  if (isPending) {
    return (
      <ChartCard title="Cycle time" subtitle={subtitle}>
        <Skeleton className="h-64 w-full" />
      </ChartCard>
    );
  }
  if (isError) {
    return (
      <ChartCard title="Cycle time" subtitle={subtitle}>
        <ErrorText>Failed to load cycle time: {error.message}</ErrorText>
      </ChartCard>
    );
  }

  const { summary, distribution } = data;

  if (summary.completed === 0) {
    return (
      <ChartCard title="Cycle time" subtitle={subtitle}>
        <EmptyState>
          {summary.withoutStart > 0
            ? `${summary.withoutStart} issues finished in the last ${weeks} weeks without ever being in progress, so none has a cycle time.`
            : `No issues have gone from in progress to done in the last ${weeks} weeks.`}
        </EmptyState>
      </ChartCard>
    );
  }

  const summaryText = `Cycle time over the last ${weeks} weeks: median ${formatDays(summary.medianDays)}, average ${formatDays(summary.averageDays)}, 90th percentile ${formatDays(summary.p90Days)}, across ${summary.completed} finished issues.`;

  return (
    <ChartCard title="Cycle time" subtitle={subtitle}>
      <div role="img" aria-label={summaryText} className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={distribution} margin={{ top: 16, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid vertical={false} stroke="var(--color-chart-grid)" />
            <XAxis
              dataKey="label"
              tick={<WrappingTick count={distribution.length} />}
              height={40}
              tickLine={false}
              axisLine={{ stroke: "var(--color-chart-grid)" }}
              interval={0}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: "var(--color-chart-axis)", fontSize: 12 }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: "var(--color-chart-grid)", opacity: 0.5 }} {...anchoredTooltipProps} />
            <Bar
              dataKey="count"
              fill="var(--color-chart-primary)"
              radius={[4, 4, 0, 0]}
              maxBarSize={36}
              isAnimationActive={false}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-[var(--color-text-muted)]">
        Median {formatDays(summary.medianDays)} · average {formatDays(summary.averageDays)} · 90th percentile {formatDays(summary.p90Days)} · {summary.completed} finished
      </p>
      {summary.withoutStart > 0 && (
        <p className="mt-1 text-xs text-[var(--color-text-muted)]">
          {summary.withoutStart} more finished without ever being in progress, so they have no cycle time.
        </p>
      )}
      <Button type="button" variant="link" className="mt-1" onClick={() => setShowTable((open) => !open)}>
        {showTable ? "Hide table" : "View as table"}
      </Button>
      {showTable && (
        <table className="mt-2 w-full max-w-sm text-left text-sm">
          <thead>
            <tr className="text-[var(--color-text-muted)]">
              <th className="py-1 font-medium">Cycle time</th>
              <th className="py-1 font-medium">Issues</th>
            </tr>
          </thead>
          <tbody>
            {distribution.map((bucket) => (
              <tr key={bucket.label} className="border-t border-[var(--color-border-default)]">
                <td className="py-1">{bucket.label}</td>
                <td className="py-1">{bucket.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ChartCard>
  );
}
