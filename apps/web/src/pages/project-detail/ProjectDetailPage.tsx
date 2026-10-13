import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { IssueStatus } from "@flowdesc/contracts";
import { projectKeys, useCurrentProject, useProjectSummaries } from "../../entities/project";
import { IssuePanel, useIssuePanel } from "../../widgets/issue-detail";
import { ProjectViewTabs } from "../../widgets/project-view-tabs";
import { issueKeys, loadedCountLabel, summaryCount, useIssueByNumber, useIssueSections, useLiveIssueUpdates } from "../../entities/issue";
import { EditIssueDialog } from "../../features/edit-issue";
import { useAuth } from "../../shared/auth/useAuth";
import { todayKey } from "../../shared/lib/dueDate";
import { useTimezone } from "../../shared/lib/timezone";
import { EmptyState, Page, PageHeader, ScrollPanel } from "../../shared/ui";
import { useIssueListParams } from "./lib/useIssueListParams";
import { IssueSection } from "./ui/IssueSection";
import { IssueToolbar } from "./ui/IssueToolbar";

/**
 * The Issues page (ADR 0072): a one-line toolbar, then the issues grouped by status (In progress, Todo, Done), or a single flat list when a
 * status tab is chosen. The page composes: the address holds the filters (useIssueListParams), the three status queries come from
 * useIssueSections, and each group is drawn by IssueSection. It also owns the edit popup, because a row (entities layer) cannot import the
 * editor (features layer); this is where the two meet.
 */
export function ProjectDetailPage() {
  const { organization } = useAuth();
  // The project comes from the address (ProjectRoute resolves the key once; never null here).
  const project = useCurrentProject();
  const queryClient = useQueryClient();
  const params = useIssueListParams();
  const timezone = useTimezone();

  // Done starts closed and is not even loaded until opened (finished work is the biggest group by far); the other two start open.
  const [open, setOpen] = useState<Record<IssueStatus, boolean>>({ in_progress: true, todo: true, done: false });
  const { plan, sections, updatedAt } = useIssueSections(
    organization!.id,
    project.id,
    { priority: params.priority, due: params.due, today: params.today, assignee: params.assignee, labels: params.labelIds, sort: params.sort, order: params.order },
    params.status,
    open.done,
  );
  useLiveIssueUpdates(project.id);

  // Exact totals for the tabs and group headers come from the project's summary, and only while nothing else narrows the list.
  const { data: summaries } = useProjectSummaries(organization!.id, todayKey(timezone));
  const summary = summaries?.find((entry) => entry.projectId === project.id);
  const exact = summary && !params.otherFiltersOn ? summary : null;
  // The summary is a separate request: re-read it whenever a group is refreshed (an issue created, moved or deleted, here or by someone else).
  useEffect(() => {
    if (updatedAt > 0) void queryClient.invalidateQueries({ queryKey: projectKeys.summaries(organization!.id) });
  }, [updatedAt, queryClient, organization]);

  const panel = useIssuePanel();
  // The edit popup follows the ISSUE (by its number), not whichever group happens to hold it: if someone else moves it to a group that is
  // not loaded (Done, closed), it would vanish from the lists and the popup would close under the person. Seeded from the row, so it opens
  // with what the person sees; live updates then keep it fresh, and the popup's own banner says what changed.
  const [editingNumber, setEditingNumber] = useState<number | null>(null);
  const [showConflictNotice, setShowConflictNotice] = useState(false);
  const { data: editingIssue } = useIssueByNumber(organization!.id, project.id, editingNumber);
  const startEditing = (issueId: string) => {
    const issue = sections.flatMap((section) => section.issues).find((entry) => entry.id === issueId);
    if (!issue) return;
    queryClient.setQueryData(issueKeys.byNumber(project.id, issue.number), issue);
    setShowConflictNotice(false);
    setEditingNumber(issue.number);
  };

  const filterKey = `${params.priority}|${params.due}|${params.assignee}|${params.labelIds.join(",")}|${params.sort}|${params.order}`;
  const tabCounts = exact
    ? { "": exact.open + exact.done, in_progress: exact.inProgress, todo: summaryCount(exact, "todo"), done: exact.done }
    : null;

  const countFor = (status: IssueStatus): string => {
    if (exact) return String(summaryCount(exact, status));
    const section = sections.find((entry) => entry.status === status);
    return section?.loaded ? loadedCountLabel(section.issues.length, section.hasNextPage) : "";
  };

  // What to draw. A flat list (a status tab) always draws its one group. Grouped, an open group with nothing in it is left out, and Done
  // keeps its header (collapsed) so finished work can always be reached, unless the project has none at all.
  const visible = sections.filter((section) => {
    if (plan.flat) return true;
    if (section.status === "done") return !(exact && exact.done === 0);
    return section.isPending || section.isError || section.issues.length > 0;
  });
  const openOnesLoaded = sections.filter((section) => section.status !== "done").every((section) => section.loaded);
  const nothingOpen = !plan.flat && openOnesLoaded && sections.filter((section) => section.status !== "done").every((section) => section.issues.length === 0);
  const flatEmpty = plan.flat && sections[0]?.loaded && sections[0].issues.length === 0;
  const filtered = Boolean(params.status || params.otherFiltersOn);

  return (
    <Page>
      {/* From sm up the page is as tall as the window (the 4rem is the Page's own vertical padding) and the list
          scrolls inside its panel, so "Load more" never stretches the page. A short list keeps its own height. */}
      <div className="flex flex-col sm:h-[calc(100dvh-4rem)] sm:min-h-[28rem]">
        <PageHeader eyebrow={project.name} title="Issues" aside={<ProjectViewTabs projectKey={project.key} panelOpen={Boolean(panel.issueRef)} />} />

        <IssueToolbar projectId={project.id} counts={tabCounts} />

        {showConflictNotice && (
          <p className="mb-2 text-sm text-[var(--color-text-warning)]">That issue was updated by someone else — showing the latest version.</p>
        )}

        {/* One surface: the groups scroll inside it. Its own width decides the layout (`@container`). Opening an issue in the floating side panel
            does NOT narrow it (owner, 2026-10-14, ADR 0073): the panel overlays its right-hand end instead. */}
        <div className="flex max-h-[65dvh] flex-col sm:max-h-none sm:min-h-0">
          <div className="@container flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
            <ScrollPanel label="Issue list" look="edges" onSurface className="min-h-0 flex-1 p-0">
              {flatEmpty ? (
                <div className="p-3">
                  <EmptyState block>{filtered ? "No issues match these filters." : "No issues yet."}</EmptyState>
                </div>
              ) : (
                <>
                  {nothingOpen && (
                    <div className="p-3">
                      <EmptyState block>{filtered ? "No open issues match these filters." : "Nothing open. Everything is done, or there are no issues yet."}</EmptyState>
                    </div>
                  )}
                  {visible.map((section) => (
                    <IssueSection
                      key={section.status}
                      status={section.status}
                      flat={plan.flat}
                      open={open[section.status]}
                      onToggle={() => setOpen((prev) => ({ ...prev, [section.status]: !prev[section.status] }))}
                      count={countFor(section.status)}
                      issues={section.issues}
                      loading={section.isPending}
                      errorMessage={section.isError ? section.error?.message ?? "Something went wrong" : null}
                      hasNextPage={section.hasNextPage}
                      isFetchingNextPage={section.isFetchingNextPage}
                      onLoadMore={() => void section.fetchNextPage()}
                      resetKey={`${filterKey}|${section.pageCount}`}
                      projectKey={project.key}
                      organizationId={organization!.id}
                      labelIds={params.labelIds}
                      onToggleLabel={params.toggleLabel}
                      onOpenIssue={panel.open}
                      onEditIssue={startEditing}
                    />
                  ))}
                </>
              )}
            </ScrollPanel>
          </div>
        </div>
      </div>
      {editingIssue && (
        <EditIssueDialog
          key={editingIssue.id}
          issue={editingIssue}
          issueKey={`${project.key}-${editingIssue.number}`}
          organizationId={organization!.id}
          projectId={project.id}
          onClose={() => setEditingNumber(null)}
          onConflict={() => setShowConflictNotice(true)}
        />
      )}
      <IssuePanel project={project} />
    </Page>
  );
}
