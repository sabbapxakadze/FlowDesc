import type { IssueStatus } from "@flowdesc/contracts";

/** Own module, not exported from StatusBadge.tsx — a component file
 * exporting a plain constant breaks Fast Refresh (react-refresh/
 * only-export-components). Shared by StatusBadge and any status filter
 * UI (e.g. ProjectDetailPage) that needs the same label set. */
export const STATUS_LABELS: Record<IssueStatus, string> = {
  todo: "Todo",
  in_progress: "In progress",
  done: "Done",
};

/**
 * Complete literal class strings in a lookup table, not a template literal
 * built from the status value: Tailwind's JIT scanner reads literal source
 * text, so a dynamically-assembled class name is invisible to it. Shared by
 * StatusBadge, ColumnHeader and SprintStatusBadge so a status is the same
 * colour everywhere.
 */
export const STATUS_DOT_CLASSES: Record<IssueStatus, string> = {
  todo: "bg-[var(--color-status-todo)]",
  in_progress: "bg-[var(--color-status-in-progress)]",
  done: "bg-[var(--color-status-done)]",
};
