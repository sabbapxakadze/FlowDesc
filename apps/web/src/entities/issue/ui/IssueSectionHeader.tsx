import { ChevronDown, ChevronRight } from "lucide-react";
import type { IssueStatus } from "@flowdesc/contracts";
import { STATUS_DOT_CLASSES, STATUS_LABELS } from "../../../shared/ui";

/**
 * The strip that starts a group of the Issues list (ADR 0072): a chevron, the status dot and name, and how many. It is a heading with a
 * button inside (the usual accordion pattern: `aria-expanded` says whether the rows below are shown), so a screen reader can jump from
 * group to group and a keyboard can open and close one. It stays at the top of the scrolling list while its rows pass beneath it.
 */
export function IssueSectionHeader({
  status,
  count,
  open,
  onToggle,
}: {
  status: IssueStatus;
  /** Already written ("8", "25+"): the exact number or a loaded count, the caller knows which. Empty while it is not known. */
  count: string;
  open: boolean;
  onToggle: () => void;
}) {
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <h2 className="sticky top-0 z-20 border-t border-[var(--color-border-default)] bg-[color-mix(in_oklab,var(--color-border-default)_35%,var(--color-bg-surface))] first:border-t-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex h-10 w-full items-center gap-2 px-4 text-left text-sm font-semibold focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-border-focus)]"
      >
        <Chevron aria-hidden size={14} className="shrink-0 text-[var(--color-text-muted)]" />
        <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT_CLASSES[status]}`} />
        {STATUS_LABELS[status]}
        {count !== "" && <span className="text-xs font-medium text-[var(--color-text-muted)]">{count}</span>}
      </button>
    </h2>
  );
}
