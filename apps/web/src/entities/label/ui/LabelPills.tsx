import { cn } from "../../../shared/ui";
import { LabelBadge } from "./LabelBadge";
import { LabelTag } from "./LabelTag";

/**
 * A short row of label pills for an issue card: the first `max` labels, then "+n" for the rest. With `onToggle` each pill
 * is a button that picks that label as a filter; the pills of the labels already chosen show a check mark and a thin inner ring. Without it they are
 * plain pills. Pure presentation: the page owns the filter. `className` replaces the default top margin (the Issues list puts the
 * pills on the title's line). `variant="outline"` draws the quiet tags (dot and name) the board and sprint cards use; it is plain, never
 * a filter button.
 */
export function LabelPills({
  labels,
  activeIds = [],
  onToggle,
  max = 3,
  className = "mt-2",
  variant = "filled",
}: {
  labels: { id: string; name: string; color: string }[];
  activeIds?: string[];
  onToggle?: (labelId: string) => void;
  max?: number;
  className?: string;
  variant?: "filled" | "outline";
}) {
  if (labels.length === 0) return null;
  const shown = labels.slice(0, max);
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      {shown.map((label) =>
        onToggle ? (
          <button
            key={label.id}
            type="button"
            aria-pressed={activeIds.includes(label.id)}
            aria-label={`Filter by label ${label.name}`}
            onClick={() => onToggle(label.id)}
            className="rounded-full focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-border-focus)]"
          >
            <LabelBadge label={label} selected={activeIds.includes(label.id)} />
          </button>
        ) : variant === "outline" ? (
          <LabelTag key={label.id} label={label} />
        ) : (
          <LabelBadge key={label.id} label={label} />
        ),
      )}
      {labels.length > max && (
        <span className="text-xs text-[var(--color-text-muted)]">
          +{labels.length - max}
        </span>
      )}
    </div>
  );
}
