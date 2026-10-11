import { useState } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis, usePlotArea } from "recharts";
import { useVelocity, type VelocitySprint } from "../../entities/analytics";
import { AnchoredTooltip, Button, ChartCard, EmptyState, ErrorText, LegendItem, anchoredTooltipProps, Skeleton } from "../../shared/ui";

type TooltipProps = {
  active?: boolean;
  coordinate?: { x: number; y: number };
  payload?: ReadonlyArray<{ payload?: VelocitySprint }>;
};

// Hand-built from semantic tokens, same reason as the other charts: the
// library default is a hardcoded white box that ignores dark mode.
function ChartTooltip({ active, coordinate, payload }: TooltipProps) {
  const sprint = payload?.[0]?.payload;
  if (!active || !sprint) return null;
  const carriedOver = sprint.committed - sprint.completed;
  return (
    <AnchoredTooltip coordinate={coordinate} orientation="column">
      <div className="rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2 text-sm shadow-sm">
        <p className="text-xs text-[var(--color-text-muted)]">{sprint.name}</p>
        <p className="font-medium">
          {sprint.completed} of {sprint.committed} completed
        </p>
        {carriedOver > 0 && <p className="text-xs text-[var(--color-text-muted)]">{carriedOver} carried over</p>}
      </div>
    </AnchoredTooltip>
  );
}

// Below this many pixels per sprint, the name is split onto two lines ("Sprint 4" -> "Sprint" / "4") instead of colliding with its neighbours.
const MIN_ONE_LINE_BAND = 56;

/**
 * The x-axis tick of a sprint: its name, and under it the share of what was committed that got finished ("100%", or in the warning colour when
 * something was carried over). The share is a text, never colour alone: the number is always printed.
 */
function SprintTick({
  x = 0,
  y = 0,
  payload,
  rows,
}: {
  x?: number;
  y?: number;
  payload?: { value: string | number };
  rows: VelocitySprint[];
}) {
  const plot = usePlotArea();
  const name = String(payload?.value ?? "");
  const row = rows.find((r) => r.name === name);
  const share = row && row.committed > 0 ? Math.round((row.completed / row.committed) * 100) : null;
  const band = plot ? plot.width / rows.length : Infinity;
  const cut = name.lastIndexOf(" ");
  const lines = band < MIN_ONE_LINE_BAND && cut > 0 ? [name.slice(0, cut), name.slice(cut + 1)] : [name];

  return (
    <text x={x} y={y} textAnchor="middle" fill="var(--color-chart-axis)" fontSize={12}>
      {lines.map((line, i) => (
        <tspan key={i} x={x} dy={i === 0 ? "0.9em" : "1.2em"}>
          {line}
        </tspan>
      ))}
      {share !== null && (
        <tspan x={x} dy="1.3em" fontWeight={600} fill={share >= 100 ? "var(--color-status-done)" : "var(--color-text-warning)"}>
          {share}%
        </tspan>
      )}
    </text>
  );
}

/**
 * Committed and completed side by side for each recent sprint (ADR 0064): the quiet bar is what the sprint took on, the strong bar what it finished,
 * and the share under the name says how much that was. Both numbers are as of each sprint's close — see ADR 0011. The headline average is in the
 * summary tiles above; here the same figure, the latest sprint and what was carried over sit in one quiet line under the chart.
 */
export function VelocityChart({
  organizationId,
  projectId,
  sprints,
}: {
  organizationId: string;
  projectId: string;
  sprints: number;
}) {
  const { data, isPending, isError, error } = useVelocity(organizationId, projectId, sprints);
  const [showTable, setShowTable] = useState(false);
  const subtitle = "Committed vs completed";

  if (isPending) {
    return (
      <ChartCard title="Sprint velocity" subtitle={subtitle}>
        <Skeleton className="h-64 w-full" />
      </ChartCard>
    );
  }
  if (isError) {
    return (
      <ChartCard title="Sprint velocity" subtitle={subtitle}>
        <ErrorText>Failed to load velocity: {error.message}</ErrorText>
      </ChartCard>
    );
  }

  const { summary, data: rows } = data;
  if (rows.length === 0) {
    return (
      <ChartCard title="Sprint velocity" subtitle={subtitle}>
        <EmptyState>No sprints have been completed yet.</EmptyState>
      </ChartCard>
    );
  }

  const last = rows[rows.length - 1]!;
  const carriedOver = last.committed - last.completed;
  const summaryText = `Velocity over the last ${rows.length} completed sprints: an average of ${summary.averageCompleted} issues completed per sprint; the latest, ${last.name}, completed ${last.completed} of ${last.committed}.`;
  const labelStyle = { fontSize: 11, fill: "var(--color-text-muted)" };

  return (
    <ChartCard
      title="Sprint velocity"
      subtitle={subtitle}
      legend={
        <>
          <LegendItem color="var(--color-chart-quiet)" label="Committed" />
          <LegendItem color="var(--color-chart-primary)" label="Completed" />
        </>
      }
    >
      <div role="img" aria-label={summaryText} className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 16, right: 8, bottom: 0, left: -16 }} barGap={3}>
            <CartesianGrid vertical={false} stroke="var(--color-chart-grid)" />
            <XAxis
              dataKey="name"
              tick={<SprintTick rows={rows} />}
              height={52}
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
            <Bar dataKey="committed" fill="var(--color-chart-quiet)" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false}>
              <LabelList dataKey="committed" position="top" style={labelStyle} />
            </Bar>
            <Bar dataKey="completed" fill="var(--color-chart-primary)" radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false}>
              <LabelList dataKey="completed" position="top" style={{ ...labelStyle, fontWeight: 600, fill: "var(--color-text-default)" }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-[var(--color-text-muted)]">
        Average {summary.averageCompleted} issues a sprint · latest, {last.name}: {last.completed} of {last.committed} · {carriedOver} carried over
      </p>
      <Button type="button" variant="link" className="mt-1" onClick={() => setShowTable((open) => !open)}>
        {showTable ? "Hide table" : "View as table"}
      </Button>
      {showTable && (
        <table className="mt-2 w-full max-w-md text-left text-sm">
          <thead>
            <tr className="text-[var(--color-text-muted)]">
              <th className="py-1 font-medium">Sprint</th>
              <th className="py-1 font-medium">Completed</th>
              <th className="py-1 font-medium">Committed</th>
              <th className="py-1 font-medium">Carried over</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.sprintId} className="border-t border-[var(--color-border-default)]">
                <td className="py-1">{row.name}</td>
                <td className="py-1">{row.completed}</td>
                <td className="py-1">{row.committed}</td>
                <td className="py-1">{row.committed - row.completed}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </ChartCard>
  );
}
