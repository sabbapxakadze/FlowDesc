import type { IssueEvent } from "@flowdesk/contracts";
import { PRIORITY_LABELS, STATUS_LABELS } from "../../../shared/ui";

/**
 * Moved out of IssueDetailPage.tsx (Phase 7 slice 3) — the notification
 * feed needs the exact same "actor did X" sentences for events on
 * issues the viewer isn't currently looking at. A second real
 * consumer, so this earns its own place in entities/issue rather than
 * staying page-local.
 */
/**
 * The same sentence for one viewer: a comment (or an edit of one) that @mentions THEM reads "mentioned you in a comment"
 * (ADR 0033), a description that does reads "mentioned you in the description" (ADR 0063). Everyone else, and every other event, reads as
 * describeEvent does.
 */
export function describeEventFor(event: IssueEvent, viewerId: string | undefined): string {
  if (
    viewerId &&
    (event.type === "issue.commented" || event.type === "issue.comment_edited") &&
    Array.isArray(event.payload.mentions) &&
    event.payload.mentions.includes(viewerId)
  ) {
    return "mentioned you in a comment";
  }
  // A description that @mentions THEM, on a new issue or in an edit that changed the description (ADR 0063).
  if (
    viewerId &&
    (event.type === "issue.created" || (event.type === "issue.updated" && "description" in event.payload)) &&
    Array.isArray(event.payload.mentions) &&
    event.payload.mentions.includes(viewerId)
  ) {
    return "mentioned you in the description";
  }
  return describeEvent(event);
}

export function describeEvent(event: IssueEvent): string {
  switch (event.type) {
    case "issue.created":
      return "created this issue";
    case "issue.label_added":
      return `added the "${String(event.payload.labelName)}" label`;
    case "issue.label_removed":
      return `removed the "${String(event.payload.labelName)}" label`;
    case "issue.updated": {
      const parts: string[] = [];
      if ("title" in event.payload) parts.push(`changed the title to "${String(event.payload.title)}"`);
      if ("status" in event.payload) parts.push(`changed status to ${STATUS_LABELS[event.payload.status as keyof typeof STATUS_LABELS] ?? String(event.payload.status)}`);
      if ("description" in event.payload) parts.push("updated the description");
      if ("assigneeId" in event.payload) {
        parts.push(
          event.payload.assigneeId
            ? `assigned this issue to ${String(event.payload.assigneeName ?? "someone")}`
            : "unassigned this issue",
        );
      }
      if ("dueDate" in event.payload) {
        parts.push(event.payload.dueDate ? `set the due date to ${String(event.payload.dueDate)}` : "removed the due date");
      }
      if ("priority" in event.payload) {
        const value = String(event.payload.priority);
        parts.push(`changed priority to ${PRIORITY_LABELS[value as keyof typeof PRIORITY_LABELS] ?? value}`);
      }
      return parts.length > 0 ? parts.join(", ") : "updated this issue";
    }
    case "issue.moved": {
      const fromStatus = String(event.payload.fromStatus);
      const toStatus = String(event.payload.toStatus);
      return fromStatus === toStatus
        ? "reordered this issue"
        : `moved this issue to ${STATUS_LABELS[toStatus as keyof typeof STATUS_LABELS] ?? toStatus}`;
    }
    case "issue.commented":
      return "commented";
    // A reorder inside the backlog or the active sprint: an audit row only, never a notification.
    case "issue.reordered":
      return "reordered this issue in its list";
    // Edits and deletes are folded into the comment itself on the timeline and
    // never notify, but the audit rows exist, so describe them if one is shown.
    case "issue.comment_edited":
      return "edited a comment";
    case "issue.comment_deleted":
      return "deleted a comment";
    case "issue.attachment_added":
      return `attached "${String(event.payload.filename)}"`;
    case "issue.attachment_removed":
      return `removed the attachment "${String(event.payload.filename)}"`;
    case "issue.sprint_assigned":
      return `assigned this issue to ${String(event.payload.sprintName)}`;
    case "issue.sprint_removed":
      return event.payload.reason === "sprint_completed"
        ? `moved this issue back to the backlog (${String(event.payload.sprintName)} completed)`
        : "moved this issue back to the backlog";
    default:
      return event.type;
  }
}
