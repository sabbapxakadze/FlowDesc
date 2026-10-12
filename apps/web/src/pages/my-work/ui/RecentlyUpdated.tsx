import { Link } from "react-router";
import type { AssignedIssue } from "@flowdesc/contracts";
import { openIssueOnClick } from "../../../entities/issue";
import { issuePath } from "../../../shared/lib/paths";
import { Time } from "../../../shared/ui";

const SHOWN = 5;

/** My open issues by last change (the list arrives that way). It is the issue's last change by anyone, not necessarily mine. */
export function RecentlyUpdated({ issues, onOpen }: { issues: AssignedIssue[]; onOpen: (issueKey: string) => void }) {
  if (issues.length === 0) return null;
  return (
    <section aria-label="Recently updated">
      <h2 className="mb-2 text-sm font-semibold">Recently updated</h2>
      <ul className="space-y-1.5 text-sm">
        {issues.slice(0, SHOWN).map((issue) => (
          <li key={issue.id} className="flex justify-between gap-2">
            <Link
              to={issuePath(issue.projectKey, issue.number)}
              data-panel-trigger
              onClick={(event) => openIssueOnClick(event, onOpen, `${issue.projectKey}-${issue.number}`)}
              className="min-w-0 truncate hover:underline"
            >
              {issue.projectKey}-{issue.number} {issue.title}
            </Link>
            <Time iso={issue.updatedAt} className="shrink-0 text-xs text-[var(--color-text-muted)]" />
          </li>
        ))}
      </ul>
    </section>
  );
}
