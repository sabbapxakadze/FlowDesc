import type { AuditEvent } from "@flowdesc/contracts";

const str = (value: unknown): string => (typeof value === "string" ? value : "");
const num = (value: unknown): number => (typeof value === "number" ? value : 0);
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
const inProject = (details: Record<string, unknown>) => (str(details.projectName) ? ` in ${str(details.projectName)}` : "");

/**
 * One plain sentence for an audit row, WITHOUT the actor's name (the page shows that
 * separately): "renamed project "Website" to "Marketing site"". Written from the row alone, so it
 * reads the same after the thing it describes has been deleted.
 */
export function describeAuditEvent(event: AuditEvent): string {
  const d = event.details;
  const label = event.targetLabel;
  switch (event.action) {
    case "project.created":
      return `created the project "${label}"`;
    case "project.renamed":
      return `renamed the project "${str(d.from)}" to "${str(d.to)}"`;
    case "project.deleted":
      return `deleted the project "${label}" and its ${plural(num(d.issueCount), "issue", "issues")}`;
    case "label.updated": {
      const parts: string[] = [];
      const name = d.name as { from?: unknown; to?: unknown } | undefined;
      const color = d.color as { from?: unknown; to?: unknown } | undefined;
      if (name) parts.push(`renamed the label "${str(name.from)}" to "${str(name.to)}"`);
      if (color) parts.push(`${name ? "and changed" : "changed"} the colour of the label "${label}" from ${str(color.from)} to ${str(color.to)}`);
      return parts.join(" ") || `updated the label "${label}"`;
    }
    case "label.deleted":
      return `deleted the label "${label}" (it was on ${plural(num(d.usedOnIssues), "issue", "issues")})`;
    case "sprint.renamed":
      return `renamed the sprint "${str(d.from)}" to "${str(d.to)}"${inProject(d)}`;
    case "sprint.started":
      return `started the sprint "${label}"${inProject(d)}`;
    case "sprint.completed":
      return `completed the sprint "${label}"${inProject(d)}${num(d.releasedIssues) > 0 ? `, sending ${plural(num(d.releasedIssues), "unfinished issue", "unfinished issues")} back to the backlog` : ""}`;
    case "sprint.deleted":
      return `deleted the sprint "${label}"${inProject(d)}`;
    case "issue.deleted":
      return `deleted the issue ${label}${inProject(d)}`;
    case "member.invited":
      return `invited ${label} to join as ${str(d.role)}`;
    case "invitation.resent":
      return `sent ${label} a new invitation`;
    case "invitation.revoked":
      return `cancelled the invitation to ${label}`;
    case "member.joined":
      return d.returning === true ? `rejoined the organization as ${str(d.role)}` : `joined the organization as ${str(d.role)}`;
    case "member.role_changed":
      return `changed the role of ${label} from ${str(d.from)} to ${str(d.to)}`;
    case "member.removed": {
      const n = num(d.unassignedIssues);
      return `removed ${label} from the organization${n > 0 ? ` (${plural(n, "issue", "issues")} became unassigned)` : ""}`;
    }
  }
}

/** Colour family of a row: something added, something removed, or a change. */
export function auditTone(event: AuditEvent): "added" | "removed" | "changed" {
  switch (event.action) {
    case "project.created":
    case "member.invited":
    case "member.joined":
    case "sprint.started":
      return "added";
    case "project.deleted":
    case "label.deleted":
    case "sprint.deleted":
    case "issue.deleted":
    case "invitation.revoked":
    case "member.removed":
      return "removed";
    default:
      return "changed";
  }
}
