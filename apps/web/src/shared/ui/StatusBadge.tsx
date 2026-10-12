import type { IssueStatus } from "@flowdesc/contracts";
import { STATUS_DOT_CLASSES, STATUS_LABELS } from "./statusLabels";

/** A colored dot + label, not a filled pill — status is a fixed 3-value
 * enum (see semantic.css's --color-status-* tokens), and a small dot
 * indicator reads clearly without needing a tinted background per status. */
export function StatusBadge({ status }: { status: IssueStatus }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-text-muted)]">
      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT_CLASSES[status]}`} />
      {STATUS_LABELS[status]}
    </span>
  );
}
