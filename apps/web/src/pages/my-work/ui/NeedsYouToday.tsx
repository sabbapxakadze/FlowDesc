import type { AssignedIssue } from "@flowdesc/contracts";
import { Card } from "../../../shared/ui";
import { IssueTile } from "./IssueTile";

/** All the overdue issues, earliest first (the right side scrolls). They are also in their own day rows of the week. */
export function NeedsYouToday({ overdue, onOpen }: { overdue: AssignedIssue[]; onOpen: (issueKey: string) => void }) {
  return (
    <Card role="region" aria-label="Needs you today" data-tour="my-needs-you" className="space-y-2 p-3">
      <h2 className="text-xs font-semibold tracking-wide text-[var(--color-text-muted)] uppercase">Needs you today</h2>
      {overdue.length === 0 ? (
        <p className="text-sm text-[var(--color-text-muted)]">Nothing is overdue.</p>
      ) : (
        <>
          <p className="text-sm font-medium text-[var(--color-text-danger)]">{overdue.length} overdue</p>
          <ul className="flex flex-col gap-2">
            {overdue.map((issue) => (
              <IssueTile key={issue.id} issue={issue} showDue onOpen={onOpen} />
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}
