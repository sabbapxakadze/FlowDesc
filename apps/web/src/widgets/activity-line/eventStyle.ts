import {
  ArrowRightLeft,
  CalendarDays,
  ArrowUpDown,
  Circle,
  FilePlus2,
  FileX2,
  Flag,
  Milestone,
  Pencil,
  Plus,
  Tag,
  Trash2,
  Undo2,
  UserMinus,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import type { IssueEvent } from "@flowdesc/contracts";

// Complete literal class strings so Tailwind can see them (no assembled names).
const ADDED = "text-[var(--color-event-added)]";
const REMOVED = "text-[var(--color-event-removed)]";
const CHANGED = "text-[var(--color-event-changed)]";
const NEUTRAL = "text-[var(--color-text-muted)]";
const STATUS_TEXT: Record<string, string> = {
  todo: "text-[var(--color-status-todo)]",
  in_progress: "text-[var(--color-status-in-progress)]",
  done: "text-[var(--color-status-done)]",
};

export interface EventStyle {
  Icon: LucideIcon;
  /** A text-color class; the icon takes it through currentColor. */
  color: string;
}

/**
 * The icon and colour of an activity line, by what happened: green for something
 * added, red for something removed, the status colour for a status change, the
 * accent for any other change, muted for a pure reorder.
 */
export function eventStyle(event: Pick<IssueEvent, "type" | "payload">): EventStyle {
  const p = event.payload;
  switch (event.type) {
    case "issue.created":
      return { Icon: Plus, color: ADDED };
    case "issue.label_added":
      return { Icon: Tag, color: ADDED };
    case "issue.label_removed":
      return { Icon: Tag, color: REMOVED };
    case "issue.attachment_added":
      return { Icon: FilePlus2, color: ADDED };
    case "issue.attachment_removed":
      return { Icon: FileX2, color: REMOVED };
    case "issue.comment_deleted":
      return { Icon: Trash2, color: REMOVED };
    case "issue.comment_edited":
      return { Icon: Pencil, color: CHANGED };
    case "issue.sprint_assigned":
      return { Icon: Milestone, color: ADDED };
    case "issue.sprint_removed":
      return { Icon: Undo2, color: REMOVED };
    case "issue.reordered":
      return { Icon: ArrowUpDown, color: NEUTRAL };
    case "issue.moved":
      return p.fromStatus === p.toStatus
        ? { Icon: ArrowUpDown, color: NEUTRAL }
        : { Icon: ArrowRightLeft, color: STATUS_TEXT[String(p.toStatus)] ?? CHANGED };
    case "issue.updated":
      if ("status" in p) return { Icon: ArrowRightLeft, color: STATUS_TEXT[String(p.status)] ?? CHANGED };
      if ("assigneeId" in p)
        return p.assigneeId ? { Icon: UserPlus, color: CHANGED } : { Icon: UserMinus, color: REMOVED };
      if ("priority" in p) return { Icon: Flag, color: CHANGED };
      if ("dueDate" in p) return { Icon: CalendarDays, color: CHANGED };
      return { Icon: Pencil, color: CHANGED };
    default:
      return { Icon: Circle, color: CHANGED };
  }
}
