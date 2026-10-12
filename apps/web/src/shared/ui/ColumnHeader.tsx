import type { IssueStatus } from "@flowdesc/contracts";
import { STATUS_DOT_CLASSES, STATUS_LABELS } from "./statusLabels";

/**
 * The heading of a board column: the status dot, its name and how many
 * issues it holds. Same dot colours as StatusBadge, so a column and the cards
 * inside it agree. `label` overrides the name for zones that are not a status
 * (the sprint page's backlog), which then show no dot.
 */
export function ColumnHeader({
  status,
  label,
  count,
}: {
  status?: IssueStatus;
  label?: string;
  count?: number;
}) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
      {status && <span className={`h-2 w-2 rounded-full ${STATUS_DOT_CLASSES[status]}`} />}
      <span>{label ?? (status ? STATUS_LABELS[status] : "")}</span>
      {count !== undefined && (
        <span className="font-normal text-[var(--color-text-muted)]">{count}</span>
      )}
    </h2>
  );
}
