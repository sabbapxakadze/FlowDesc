/**
 * The small pictures beside the numbers in the analytics summary tiles (ADR 0064). Plain SVG on the chart tokens, drawn at a fixed small size; they
 * are decoration for the number next to them, so they are hidden from assistive tech (the tile's text says everything they show).
 */
const W = 92;
const H = 34;

/** One thin bar per value; a zero is a short quiet tick, so an empty week still takes its place. */
export function SparkBars({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const band = W / Math.max(values.length, 1);
  return (
    <svg width={W} height={H} aria-hidden="true">
      {values.map((value, i) => {
        const h = value === 0 ? 2 : Math.max((value / max) * H, 3);
        return (
          <rect
            key={i}
            x={i * band + 1}
            y={H - h}
            width={Math.max(band - 2.5, 1)}
            height={h}
            rx={1.5}
            fill={value === 0 ? "var(--color-chart-quiet)" : "var(--color-chart-primary)"}
          />
        );
      })}
    </svg>
  );
}

/** A scale from 0 days with the 90th percentile as a soft stretch and the median as a dot. The scale is 7 days, or longer when the data needs it. */
export function RangeBar({ median, p90 }: { median: number; p90: number | null }) {
  const scaleMax = Math.max(7, Math.ceil(p90 ?? median));
  const x = (days: number) => 4 + (Math.min(days, scaleMax) / scaleMax) * (W - 8);
  return (
    <svg width={W} height={H} aria-hidden="true">
      <text x={4} y={9} fontSize={10} fill="var(--color-chart-axis)">
        0
      </text>
      <text x={W - 4} y={9} fontSize={10} textAnchor="end" fill="var(--color-chart-axis)">
        {scaleMax} d
      </text>
      <line x1={4} x2={W - 4} y1={22} y2={22} stroke="var(--color-chart-quiet)" strokeWidth={6} strokeLinecap="round" />
      {p90 !== null && <line x1={x(0)} x2={x(p90)} y1={22} y2={22} stroke="var(--color-chart-primary)" strokeWidth={6} strokeLinecap="round" opacity={0.45} />}
      <circle cx={x(median)} cy={22} r={6} fill="var(--color-chart-primary)" stroke="var(--color-bg-surface)" strokeWidth={2} />
    </svg>
  );
}

/** Committed (quiet) and completed (strong) per sprint, side by side. */
export function SparkPairs({ rows }: { rows: { committed: number; completed: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => Math.max(row.committed, row.completed)));
  const band = W / (rows.length * 2 + 1);
  return (
    <svg width={W} height={H} aria-hidden="true">
      {rows.map((row, i) => {
        const hc = Math.max((row.committed / max) * H, 2);
        const hd = Math.max((row.completed / max) * H, 2);
        return (
          <g key={i}>
            <rect x={band * (i * 2 + 0.5)} y={H - hc} width={Math.max(band - 2, 1)} height={hc} rx={1.5} fill="var(--color-chart-quiet)" />
            <rect x={band * (i * 2 + 1.5)} y={H - hd} width={Math.max(band - 2, 1)} height={hd} rx={1.5} fill="var(--color-chart-primary)" />
          </g>
        );
      })}
    </svg>
  );
}

/** Two parts of one whole: the open work split into in progress and to do. */
export function MiniStack({ inProgress, todo }: { inProgress: number; todo: number }) {
  const total = Math.max(inProgress + todo, 1);
  const gap = inProgress > 0 && todo > 0 ? 2 : 0;
  const a = (inProgress / total) * W - gap / 2;
  const b = (todo / total) * W - gap / 2;
  return (
    <svg width={W} height={10} aria-hidden="true">
      {inProgress > 0 && <rect x={0} y={0} width={a} height={10} rx={4} fill="var(--color-status-in-progress)" />}
      {todo > 0 && <rect x={a + gap} y={0} width={b} height={10} rx={4} fill="var(--color-status-todo)" />}
    </svg>
  );
}
