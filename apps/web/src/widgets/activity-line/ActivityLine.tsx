import type { ReactNode } from "react";
import type { IssueEvent } from "@flowdesc/contracts";
import { describeEvent, ViaToken } from "../../entities/issue";
import { PersonName } from "../../entities/member";
import { formatDueDate, todayKey } from "../../shared/lib/dueDate";
import {
  PRIORITY_LABELS,
  PriorityBadge,
  StatusBadge,
  STATUS_LABELS,
  Time,
  useRowMotionProps,
  type RowState,
} from "../../shared/ui";
import { eventStyle } from "./eventStyle";

const STRONG = "font-medium text-[var(--color-text-default)]";

interface Part {
  verb: string;
  object?: ReactNode;
}

function isStatus(value: unknown): value is keyof typeof STATUS_LABELS {
  return typeof value === "string" && value in STATUS_LABELS;
}

function isPriority(value: unknown): value is keyof typeof PRIORITY_LABELS {
  return typeof value === "string" && value in PRIORITY_LABELS;
}

function LabelPill({ name }: { name: string }) {
  return (
    <span className="rounded-full border border-[var(--color-border-default)] px-2 py-0.5 text-xs font-medium text-[var(--color-text-default)]">
      {name}
    </span>
  );
}

/**
 * What happened, as a verb phrase plus an optional "object" shown as the same small
 * component used on cards (status dot, priority icon, label pill) or, for a person,
 * the hoverable name. Events this does not know fall back to describeEvent's text,
 * which is also what the notification bell shows.
 */
function partsOf(event: IssueEvent, organizationId: string): Part[] {
  const p = event.payload;
  switch (event.type) {
    case "issue.created":
      return [{ verb: "created this issue" }];
    case "issue.label_added":
      return [{ verb: "added the label", object: <LabelPill name={String(p.labelName)} /> }];
    case "issue.label_removed":
      return [{ verb: "removed the label", object: <LabelPill name={String(p.labelName)} /> }];
    case "issue.attachment_added":
      return [{ verb: "attached", object: <span className={STRONG}>{String(p.filename)}</span> }];
    case "issue.attachment_removed":
      return [
        {
          verb: "removed the attachment",
          object: <span className={`${STRONG} line-through opacity-70`}>{String(p.filename)}</span>,
        },
      ];
    case "issue.sprint_assigned":
      return [{ verb: "assigned this issue to", object: <span className={STRONG}>{String(p.sprintName)}</span> }];
    case "issue.sprint_removed":
      return [
        {
          verb: "moved this issue back to the backlog",
          object:
            p.reason === "sprint_completed" ? <span>({String(p.sprintName)} completed)</span> : undefined,
        },
      ];
    case "issue.moved":
      if (p.fromStatus === p.toStatus) return [{ verb: "reordered this issue" }];
      return [
        {
          verb: "moved this issue to",
          object: isStatus(p.toStatus) ? <StatusBadge status={p.toStatus} /> : String(p.toStatus),
        },
      ];
    case "issue.updated": {
      const parts: Part[] = [];
      if ("title" in p)
        parts.push({ verb: "changed the title to", object: <span className={STRONG}>“{String(p.title)}”</span> });
      if ("status" in p)
        parts.push({
          verb: "changed status to",
          object: isStatus(p.status) ? <StatusBadge status={p.status} /> : String(p.status),
        });
      if ("description" in p) parts.push({ verb: "updated the description" });
      if ("assigneeId" in p) {
        parts.push(
          p.assigneeId
            ? {
                verb: "assigned this issue to",
                object: (
                  <PersonName
                    organizationId={organizationId}
                    userId={String(p.assigneeId)}
                    name={String(p.assigneeName ?? "someone")}
                  />
                ),
              }
            : {
                verb:
                  p.reason === "member_removed"
                    ? "unassigned this issue (their assignee was removed from the organization)"
                    : "unassigned this issue",
              },
        );
      }
      if ("dueDate" in p)
        parts.push(
          p.dueDate
            ? { verb: "set the due date to", object: <span className={STRONG}>{formatDueDate(String(p.dueDate), todayKey(null))}</span> }
            : { verb: "removed the due date" },
        );
      if ("priority" in p)
        parts.push({
          verb: "changed priority to",
          object: !isPriority(p.priority) ? (
            String(p.priority)
          ) : p.priority === "none" ? (
            <span className={STRONG}>None</span>
          ) : (
            <PriorityBadge priority={p.priority} />
          ),
        });
      return parts.length > 0 ? parts : [{ verb: "updated this issue" }];
    }
    default:
      return [{ verb: describeEvent(event) }];
  }
}

/**
 * One activity line on an issue's timeline (the owner's design pass, 2026-10-02):
 * a tinted circle with an icon for what happened, then the sentence with the actor
 * (and anyone else mentioned) as a hoverable name, and the time at the right edge.
 * The sentence is plain text first, so it still reads without the colours.
 */
export function ActivityLine({
  event,
  organizationId,
  rowState,
  rowIndex,
}: {
  event: IssueEvent;
  organizationId: string;
  /** Motion of a row in a useAnimatedList list (see Card). */
  rowState?: RowState;
  rowIndex?: number;
}) {
  const { Icon, color } = eventStyle(event);
  const { ref: rowRef, className: rowClass, style: rowStyle } = useRowMotionProps<HTMLLIElement>(rowState, rowIndex);
  const parts = partsOf(event, organizationId);

  return (
    <li
      ref={rowRef}
      style={rowStyle}
      className={`flex items-center gap-3 text-sm text-[var(--color-text-muted)] ${rowClass}`}
    >
      <span
        className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-border-default)] ${color}`}
      >
        <Icon size={14} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <PersonName organizationId={organizationId} userId={event.actorId} name={event.actorName} />{" "}
        {event.viaToken && (
          <>
            <ViaToken />{" "}
          </>
        )}
        {parts.map((part, i) => (
          <span key={i}>
            {i > 0 && ", "}
            {part.verb}
            {part.object !== undefined && <> {part.object}</>}
          </span>
        ))}
      </span>
      <Time iso={event.createdAt} className="shrink-0 whitespace-nowrap text-xs" />
    </li>
  );
}
