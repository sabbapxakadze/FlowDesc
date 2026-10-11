import { useId, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useThroughput, type ThroughputPoint } from "../../entities/analytics";
import { AnchoredTooltip, Button, ChartCard, EmptyState, ErrorText, LegendItem, anchoredTooltipProps, Skeleton } from "../../shared/ui";

// weekStart is a plain UTC date (Monday). Formatted in UTC on purpose: a
// local-timezone format would show "Sep 27" for Monday Sep 28 west of UTC.
function formatWeek(weekStart: string): string {
  return new Date(`${weekStart}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

type TooltipProps = {
  active?: boolean;
  coordinate?: { x: number; y: number };
  payload?: ReadonlyArray<{ payload?: ThroughputPoint }>;
};

// A hand-built tooltip (semantic tokens only) instead of recharts' default,
// which ships its own hardcoded white box and would ignore dark mode.
function ChartTooltip({ active, coordinate, payload }: TooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  return (
    <AnchoredTooltip coordinate={coordinate} orientation="column">
      <div className="rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm shadow-sm">
        <p className="text-xs text-[var(--color-text-muted)]">Week of {formatWeek(point.weekStart)}</p>
        <p className="font-medium">
          {point.completed} {point.completed === 1 ? "issue" : "issues"} completed
        </p>
      </div>
    </AnchoredTooltip>
  );
}

function ThroughputTable({ points }: { points: ThroughputPoint[] }) {
  return (
    <table className="mt-2 w-full max-w-sm text-left text-sm">
      <thead>
        <tr className="text-[var(--color-text-muted)]">
          <th className="py-1 font-medium">Week of</th>
          <th className="py-1 font-medium">Completed</th>
        </tr>
      </thead>
      <tbody>
        {points.map((point) => (
          <tr key={point.weekStart} className="border-t border-[var(--color-border-default)]">
            <td className="py-1">{formatWeek(point.weekStart)}</td>
            <td className="py-1">{point.completed}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const AXIS_TICK = { fill: "var(--color-chart-axis)", fontSize: 12 };

/**
 * Issues completed per week, as an area chart with a dot on every week (ADR 0064). The dots matter: weekly counts have nothing between the weeks, so
 * the line only joins them, and a week with nothing finished sits on the baseline as a dot instead of vanishing. The best weeks carry their number,
 * and a dashed line marks the average. One series, so the legend names the average only. Colors come from the --color-chart-* semantic tokens (dark
 * mode redefines them; nothing here is theme-aware). The SVG is described by a text summary and a table view exists, so the numbers never depend
 * on seeing the chart.
 */
export function ThroughputChart({
  organizationId,
  projectId,
  weeks,
}: {
  organizationId: string;
  projectId: string;
  weeks: number;
}) {
  const { data, isPending, isError, error } = useThroughput(organizationId, projectId, weeks);
  const [showTable, setShowTable] = useState(false);
  const gradientId = `throughput-fill-${useId().replace(/:/g, "")}`;
  const subtitle = "Issues completed each week";

  if (isPending) {
    return (
      <ChartCard title="Throughput" subtitle={subtitle}>
        <Skeleton className="h-64 w-full" />
      </ChartCard>
    );
  }
  if (isError) {
    return (
      <ChartCard title="Throughput" subtitle={subtitle}>
        <ErrorText>Failed to load throughput: {error.message}</ErrorText>
      </ChartCard>
    );
  }

  const total = data.reduce((sum, point) => sum + point.completed, 0);
  if (total === 0) {
    return (
      <ChartCard title="Throughput" subtitle={subtitle}>
        <EmptyState>No issues were completed in the last {weeks} weeks.</EmptyState>
      </ChartCard>
    );
  }

  const average = total / data.length;
  const averageText = Number.isInteger(average) ? String(average) : average.toFixed(1);
  const peak = Math.max(...data.map((point) => point.completed));
  const summary = `Issues completed per week over the last ${weeks} weeks: ${total} in total, ${averageText} a week on average.`;

  // A dot on every week; the best weeks are drawn larger and carry their number.
  const renderDot = (props: { cx?: number; cy?: number; payload?: ThroughputPoint }) => {
    const { cx, cy, payload } = props;
    if (cx === undefined || cy === undefined || !payload) return <g key="empty" />;
    const best = payload.completed === peak;
    return (
      <g key={payload.weekStart}>
        <circle cx={cx} cy={cy} r={best ? 5 : 3} fill="var(--color-chart-primary)" stroke="var(--color-bg-surface)" strokeWidth={2} />
        {best && (
          <text x={cx} y={cy - 11} textAnchor="middle" fontSize={12} fontWeight={600} fill="var(--color-text-default)">
            {payload.completed}
          </text>
        )}
      </g>
    );
  };

  return (
    <ChartCard
      title="Throughput"
      subtitle={subtitle}
      legend={
        <>
          <LegendItem color="var(--color-chart-primary)" label="Completed" />
          <LegendItem color="var(--color-chart-axis)" label={`Average ${averageText}`} dashed />
        </>
      }
    >
      <div role="img" aria-label={summary} className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 16, right: 16, bottom: 0, left: -16 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="var(--color-chart-primary)" stopOpacity={0.28} />
                <stop offset="1" stopColor="var(--color-chart-primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--color-chart-grid)" />
            <XAxis
              dataKey="weekStart"
              tickFormatter={formatWeek}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: "var(--color-chart-grid)" }}
              interval="preserveStartEnd"
            />
            <YAxis
              allowDecimals={false}
              domain={[0, (dataMax: number) => Math.max(dataMax + 1, 4)]}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
            />
            <ReferenceLine y={average} stroke="var(--color-chart-axis)" strokeDasharray="4 4" strokeWidth={1.2} />
            <Tooltip
              content={<ChartTooltip />}
              cursor={{ stroke: "var(--color-chart-axis)", strokeDasharray: "3 3", strokeWidth: 1 }}
              {...anchoredTooltipProps}
            />
            <Area
              type="linear"
              dataKey="completed"
              stroke="var(--color-chart-primary)"
              strokeWidth={2.2}
              strokeLinejoin="round"
              fill={`url(#${gradientId})`}
              dot={renderDot}
              activeDot={{ r: 6, fill: "var(--color-chart-primary)", stroke: "var(--color-bg-surface)", strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <Button type="button" variant="link" className="mt-1" onClick={() => setShowTable((open) => !open)}>
        {showTable ? "Hide table" : "View as table"}
      </Button>
      {showTable && <ThroughputTable points={data} />}
    </ChartCard>
  );
}
