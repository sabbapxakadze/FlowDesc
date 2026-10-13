import { ChevronDown, ChevronUp, ChevronsUp, Minus, type LucideIcon } from "lucide-react";
import type { IssuePriority } from "@flowdesc/contracts";
import { PRIORITY_LABELS } from "./priorityLabels";

const ICONS: Record<Exclude<IssuePriority, "none">, LucideIcon> = {
  urgent: ChevronsUp,
  high: ChevronUp,
  medium: Minus,
  low: ChevronDown,
};

// Only the two that need attention get a colour; the rest stay muted so a
// board full of medium and low issues does not look like a wall of alerts.
const COLOR: Record<IssuePriority, string> = {
  urgent: "text-[var(--color-text-danger)]",
  high: "text-[var(--color-text-warning)]",
  medium: "text-[var(--color-text-muted)]",
  low: "text-[var(--color-text-muted)]",
  none: "text-[var(--color-text-muted)]",
};

/** Just the icon, for places that already show the label (a dropdown option). A blank of the same width for "none". */
export function PriorityIcon({ priority }: { priority: IssuePriority }) {
  if (priority === "none") return <span className="inline-block w-3.5" />;
  const Icon = ICONS[priority];
  return <Icon aria-hidden className={`h-3.5 w-3.5 ${COLOR[priority]}`} />;
}

/**
 * Just the icon, with its name for assistive technology ("High priority"), for a row that has no room for the word (the Issues list, ADR 0072).
 * "None" is an empty spacer of the same width, so the columns after it never move.
 */
export function PriorityMark({ priority }: { priority: IssuePriority }) {
  if (priority === "none") return <span aria-hidden="true" className="inline-block h-3.5 w-3.5" />;
  const Icon = ICONS[priority];
  return <Icon role="img" aria-label={`${PRIORITY_LABELS[priority]} priority`} className={`h-3.5 w-3.5 ${COLOR[priority]}`} />;
}

/**
 * An icon plus a label, never colour alone. Renders nothing for "none": most
 * issues have no priority and an empty marker on every card is noise.
 */
export function PriorityBadge({ priority }: { priority: IssuePriority }) {
  if (priority === "none") return null;
  const Icon = ICONS[priority];
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-medium ${COLOR[priority]}`}
    >
      <Icon aria-hidden className="h-3.5 w-3.5" />
      {PRIORITY_LABELS[priority]}
    </span>
  );
}
