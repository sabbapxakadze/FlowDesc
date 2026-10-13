import type { IssueStatus } from "@flowdesc/contracts";
import { AssigneeAvatar } from "../../../entities/member";
import { IssueRow, IssueSectionHeader, type IssueListItem } from "../../../entities/issue";
import { LabelPills } from "../../../entities/label";
import { Button, ErrorText, Skeleton, STATUS_LABELS, useAnimatedList } from "../../../shared/ui";

/**
 * One group of the Issues list (ADR 0072): its header strip (left out when the list is a single status tab), then its rows and its own
 * "Load more". It owns its rows' motion (`useAnimatedList`), so an issue that changes status leaves one group and rises into another.
 * The page decides which groups exist and what their numbers are; this only draws one.
 */
export function IssueSection({
  status,
  flat,
  open,
  onToggle,
  count,
  issues,
  loading,
  errorMessage,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  resetKey,
  projectKey,
  organizationId,
  labelIds,
  onToggleLabel,
  onOpenIssue,
  onEditIssue,
}: {
  status: IssueStatus;
  flat: boolean;
  open: boolean;
  onToggle: () => void;
  count: string;
  issues: IssueListItem[];
  loading: boolean;
  errorMessage: string | null;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  /** Everything that replaces the group wholesale (filters, sort) plus how many pages are loaded: the animation key, see useAnimatedList. */
  resetKey: string;
  projectKey: string;
  organizationId: string;
  labelIds: string[];
  onToggleLabel: (labelId: string) => void;
  onOpenIssue: (issueId: string) => void;
  onEditIssue: (issueId: string) => void;
}) {
  const rows = useAnimatedList(issues, (issue) => issue.id, { ready: !loading, resetKey });
  const shown = flat || open;

  return (
    <section aria-label={`${STATUS_LABELS[status]} issues`}>
      {!flat && <IssueSectionHeader status={status} count={count} open={open} onToggle={onToggle} />}
      {shown &&
        (loading ? (
          <div className="flex flex-col gap-2 px-4 py-3">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : errorMessage ? (
          <div className="px-4 py-3">
            <ErrorText>Failed to load issues: {errorMessage}</ErrorText>
          </div>
        ) : (
          <>
            <ul>
              {rows.map(({ key, item: issue, state, index }) => (
                <IssueRow
                  key={key}
                  rowState={state}
                  rowIndex={index}
                  issue={issue}
                  projectKey={projectKey}
                  assignee={
                    issue.assigneeId ? <AssigneeAvatar organizationId={organizationId} userId={issue.assigneeId} size="md" align="right" /> : null
                  }
                  labels={<LabelPills labels={issue.labels} activeIds={labelIds} onToggle={onToggleLabel} className="relative z-10 shrink-0 flex-nowrap" />}
                  onOpen={onOpenIssue}
                  onEdit={() => onEditIssue(issue.id)}
                />
              ))}
            </ul>
            {hasNextPage && (
              <Button variant="secondary" size="sm" className="m-3" disabled={isFetchingNextPage} onClick={onLoadMore}>
                {isFetchingNextPage ? "Loading…" : `Load more ${STATUS_LABELS[status].toLowerCase()}`}
              </Button>
            )}
          </>
        ))}
    </section>
  );
}
