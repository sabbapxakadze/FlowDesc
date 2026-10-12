import type { IssueStatus } from "@flowdesc/contracts";
import type { DropdownOption } from "./Dropdown";
import { PriorityIcon } from "./PriorityBadge";
import { PRIORITY_LABELS, PRIORITY_ORDER } from "./priorityLabels";
import { STATUS_DOT_CLASSES, STATUS_LABELS } from "./statusLabels";

const STATUSES: IssueStatus[] = ["todo", "in_progress", "done"];

/** Status and priority as dropdown options, with the same dot and icon the badges use. */
export const STATUS_OPTIONS: DropdownOption[] = STATUSES.map((status) => ({
  value: status,
  label: STATUS_LABELS[status],
  icon: <span className={`h-2 w-2 rounded-full ${STATUS_DOT_CLASSES[status]}`} />,
}));

export const PRIORITY_OPTIONS: DropdownOption[] = PRIORITY_ORDER.map((priority) => ({
  value: priority,
  label: PRIORITY_LABELS[priority],
  // "No priority" has no mark (a blank one would indent its text in the box).
  icon: priority === "none" ? undefined : <PriorityIcon priority={priority} />,
}));
