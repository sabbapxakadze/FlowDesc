import type { ReactNode } from "react";
import { Card } from "./Card";
import { cn } from "./lib/cn";

/**
 * The card one chart lives in (the analytics page, ADR 0064): a title, a one-line subtitle saying what is counted, and, at the right, a small legend
 * when the chart has more than one thing to tell apart. Domain-free: the caller supplies the words and the chart. The title is an h2 so the page's
 * outline stays one level under the page's h1. It fills the height of its grid cell (`h-full`), so two cards in one row end at the same line.
 */
export function ChartCard({
  title,
  subtitle,
  legend,
  className,
  children,
}: {
  title: string;
  subtitle?: string;
  legend?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn("h-full p-5", className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{subtitle}</p>}
        </div>
        {legend && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-x-3 gap-y-1 text-xs text-[var(--color-text-muted)]">{legend}</div>
        )}
      </div>
      {children}
    </Card>
  );
}

/** One entry of a ChartCard legend: a small swatch (a colour token, or a dashed line for a reference line) and its name. */
export function LegendItem({ color, label, dashed = false }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {dashed ? (
        <svg width="16" height="6" aria-hidden="true">
          <line x1="0" x2="16" y1="3" y2="3" stroke={color} strokeWidth="1.5" strokeDasharray="4 3" />
        </svg>
      ) : (
        <i aria-hidden="true" className="inline-block h-2 w-2 rounded-xs" style={{ backgroundColor: color }} />
      )}
      {label}
    </span>
  );
}
