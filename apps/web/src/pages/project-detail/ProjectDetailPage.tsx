import { useState } from "react";
import { useSearchParams } from "react-router";
import type { IssuePriority, IssueStatus } from "@flowdesc/contracts";
import { useCurrentProject } from "../../entities/project";
import { IssuePanel, useIssuePanel } from "../../widgets/issue-detail";
import { ProjectViewTabs } from "../../widgets/project-view-tabs";
import { AssigneeAvatar, memberOptions, useMembers } from "../../entities/member";
import { IssueListHeader, IssueRow, useIssues, useLiveIssueUpdates } from "../../entities/issue";
import { LabelPills, useLabels } from "../../entities/label";
import { NewIssueButton } from "../../features/create-issue";
import { EditIssueDialog } from "../../features/edit-issue";
import { useAuth } from "../../shared/auth/useAuth";
import { isUuid } from "../../shared/lib/paths";
import { todayKey } from "../../shared/lib/dueDate";
import { useTimezone } from "../../shared/lib/timezone";
import {
  Button,
  Card,
  Dropdown,
  EmptyState,
  ErrorText,
  Page,
  PageHeader,
  PRIORITY_OPTIONS,
  PRIORITY_ORDER,
  ScrollPanel,
  Skeleton,
  STATUS_OPTIONS,
  useAnimatedList,
} from "../../shared/ui";

const STATUS_FILTER_VALUES: IssueStatus[] = ["todo", "in_progress", "done"];

function isIssueStatus(value: string | null): value is IssueStatus {
  return value !== null && (STATUS_FILTER_VALUES as string[]).includes(value);
}

function isIssuePriority(value: string | null): value is IssuePriority {
  return value !== null && (PRIORITY_ORDER as string[]).includes(value);
}

function IssueListSkeleton() {
  return (
    <ul className="flex flex-col gap-2">
      {Array.from({ length: 3 }, (_, i) => (
        <Card key={i} as="li">
          <Skeleton className="mb-2 h-3 w-16" />
          <Skeleton className="mb-2 h-4 w-48" />
          <Skeleton className="h-3 w-20" />
        </Card>
      ))}
    </ul>
  );
}

/**
 * No dedicated "get one project" fetch — this reuses the same
 * useProjects(organizationId) query the projects list page already
 * populates (TanStack Query serves it from cache) and finds the project
 * client-side. Keeps this slice scoped to issues; see the Phase 3 slice 1
 * plan's "Decisions" section.
 */
export function ProjectDetailPage() {
  const { organization, user } = useAuth();
  // The project comes from the address (ProjectRoute resolves the key once; never null here).
  const project = useCurrentProject();
  const projectId = project.id;

  // The URL is the source of truth for filter/sort state, not component
  // state — a bookmarked or reloaded ?status=...&order=... URL reproduces
  // the same view. Omitted params mean "all statuses" / newest-first,
  // matching the API's own defaults (see listIssuesQuerySchema).
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get("status");
  const status = isIssueStatus(statusParam) ? statusParam : undefined;
  const priorityParam = searchParams.get("priority");
  const priority = isIssuePriority(priorityParam) ? priorityParam : undefined;
  const dueParam = searchParams.get("due");
  const due = dueParam === "overdue" || dueParam === "none" ? dueParam : undefined;
  // "Overdue" is judged against the person's own calendar day, the same one the overdue marker on each card uses.
  const timezone = useTimezone();
  const today = due === "overdue" ? todayKey(timezone) : undefined;
  // A user id or "unassigned". Not validated against the member list: an id that
  // matches nobody simply returns an empty list, and the API rejects a non-uuid.
  const assigneeParam = searchParams.get("assignee");
  const assignee = assigneeParam && assigneeParam !== "" ? assigneeParam : undefined;
  // The chosen labels (?label=a&label=b): an issue must have ALL of them. Anything that is not an id is ignored.
  const labelIds = [...new Set(searchParams.getAll("label").filter(isUuid))];
  const sort = searchParams.get("sort") === "priority" ? "priority" : undefined;
  const order = searchParams.get("order") === "asc" ? "asc" : undefined;
  // The three choices the dropdown offers: newest first (the default, nothing in the URL),
  // oldest first (?order=asc), highest priority first (?sort=priority) and lowest priority first (?sort=priority&order=asc:
  // the API flips the whole key, so "no priority" comes first, then low, medium, high, urgent, oldest first within each).
  const sortChoice =
    sort === "priority" ? (order === "asc" ? "priority-low" : "priority") : order === "asc" ? "oldest" : "newest";

  const {
    data,
    isPending: issuesPending,
    isError,
    error,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useIssues(organization!.id, projectId, { status, priority, due, today, assignee, labels: labelIds, sort, order });
  const { data: members } = useMembers(organization!.id);
  const { data: orgLabels } = useLabels(organization!.id);
  useLiveIssueUpdates(projectId);
  // useInfiniteQuery's data is { pages: Page[], pageParams }, not a flat
  // list — flatten once here so the rest of this page (and IssueRow)
  // doesn't need to know pagination happened at all. The ?? [] is only
  // reached before the first page loads, already gated below by
  // issuesPending — never a real empty-vs-loading ambiguity.
  const issues = data?.pages.flatMap((page) => page.data) ?? [];
  // Rows that appear or leave (created, deleted, changed by someone else) move; a new filter, sort or page of
  // results is not a change (it is part of the reset key), so those rows just rise in.
  const issueRows = useAnimatedList(issues, (issue) => issue.id, {
    ready: !issuesPending,
    resetKey: `${status}|${priority}|${due}|${assignee}|${labelIds.join(",")}|${sort}|${order}|${data?.pages.length ?? 0}`,
  });

  // Which issue (if any) is open in the edit popup: page-level state because IssueRow (entities layer) can't
  // import the editor (features layer); this is where the two compose.
  const panel = useIssuePanel();
  const [editingIssueId, setEditingIssueId] = useState<string | null>(null);
  const [showConflictNotice, setShowConflictNotice] = useState(false);
  const editingIssue = issueRows.find(({ item }) => item.id === editingIssueId)?.item;

  function setStatusFilter(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === "") {
        next.delete("status");
      } else {
        next.set("status", value);
      }
      return next;
    });
  }

  function setPriorityFilter(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === "") {
        next.delete("priority");
      } else {
        next.set("priority", value);
      }
      return next;
    });
  }

  function setDueFilter(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === "") {
        next.delete("due");
      } else {
        next.set("due", value);
      }
      return next;
    });
  }

  function setAssigneeFilter(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === "") {
        next.delete("assignee");
      } else {
        next.set("assignee", value);
      }
      return next;
    });
  }

  function setLabelIds(next: string[]) {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      params.delete("label");
      for (const id of next) params.append("label", id);
      return params;
    });
  }
  const toggleLabel = (id: string) => setLabelIds(labelIds.includes(id) ? labelIds.filter((x) => x !== id) : [...labelIds, id]);

  function setSortChoice(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("sort");
      next.delete("order");
      if (value === "oldest") next.set("order", "asc");
      if (value === "priority") next.set("sort", "priority");
      if (value === "priority-low") {
        next.set("sort", "priority");
        next.set("order", "asc");
      }
      return next;
    });
  }

  return (
    <Page>
      {/* From sm up the page is as tall as the window (the 4rem is the Page's own vertical padding) and the list
          scrolls inside its panel, so "Load more" never stretches the page. A short list keeps its own height. */}
      <div className="flex flex-col sm:h-[calc(100dvh-4rem)] sm:min-h-[28rem]">
      <PageHeader eyebrow={project.name} title="Issues" aside={<ProjectViewTabs projectKey={project.key} panelOpen={Boolean(panel.issueRef)} />} />

      {/* The same row, in the same place, as on the Board (ADR 0035). */}
      <div className="mt-4 flex items-center">
        <NewIssueButton organizationId={organization!.id} projectId={project.id} />
      </div>

      {/* data-panel-trigger: working the filters while an issue is open in the side panel must not
          close it (the panel ignores clicks here), and the list changes behind it. */}
      {/* While the floating panel is open (480px wide, plus its margin) the row keeps clear of it, so
          a filter that would sit underneath wraps onto a second line instead of being unreachable. Only below
          1560px, on purpose (owner, 2026-10-07): on a wider window the row does not move when the panel opens. Between about 1560px and 2240px the
          floating panel therefore covers the right-hand end of the list (the assignee and Edit columns, part of the due date); Esc closes it. */}
      <div
        data-panel-trigger
        data-tour="issue-filters"
        className={`mt-3 mb-3 flex flex-wrap items-center gap-2 ${panel.issueRef ? "sm:max-[1559px]:pr-[31rem]" : ""}`}
      >
        <Dropdown
          aria-label="Filter by status"
          className="w-auto"
          value={status ?? ""}
          onChange={setStatusFilter}
          options={[{ value: "", label: "All statuses" }, ...STATUS_OPTIONS]}
        />
        <Dropdown
          aria-label="Filter by priority"
          className="w-auto"
          value={priority ?? ""}
          onChange={setPriorityFilter}
          options={[{ value: "", label: "All priorities" }, ...PRIORITY_OPTIONS]}
        />
        <Dropdown
          aria-label="Filter by due date"
          className="w-auto"
          value={due ?? ""}
          onChange={setDueFilter}
          options={[
            { value: "", label: "Any due date" },
            { value: "overdue", label: "Overdue" },
            { value: "none", label: "No due date" },
          ]}
        />
        <Dropdown
          aria-label="Filter by assignee"
          className="w-auto"
          value={assignee ?? ""}
          onChange={setAssigneeFilter}
          options={[
            { value: "", label: "Anyone" },
            { value: "unassigned", label: "Unassigned" },
            // "Assigned to me" is just the signed-in user's own id.
            ...(user ? [{ value: user.id, label: "Assigned to me" }] : []),
            ...memberOptions(members?.filter((member) => member.userId !== user?.id)),
          ]}
        />
        <Dropdown
          aria-label="Filter by label"
          multiple
          className="w-auto"
          placeholder="All labels"
          values={labelIds}
          onToggle={toggleLabel}
          onClear={() => setLabelIds([])}
          options={(orgLabels ?? []).map((label) => ({
            value: label.id,
            label: label.name,
            icon: <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: label.color }} />,
          }))}
        />
        <Dropdown
          aria-label="Sort"
          className="w-auto"
          value={sortChoice}
          onChange={setSortChoice}
          options={[
            { value: "newest", label: "Newest first" },
            { value: "oldest", label: "Oldest first" },
            { value: "priority", label: "Highest priority first" },
    { value: "priority-low", label: "Lowest priority first" },
          ]}
        />
      </div>

      {showConflictNotice && (
        <p className="mb-2 text-sm text-[var(--color-text-warning)]">
          That issue was updated by someone else — showing the latest version.
        </p>
      )}

      {issuesPending ? (
        <IssueListSkeleton />
      ) : isError ? (
        <ErrorText>Failed to load issues: {error.message}</ErrorText>
      ) : issueRows.length === 0 ? (
        <EmptyState block>
          {status || priority || due || assignee || labelIds.length > 0
            ? "No issues match these filters."
            : "No issues yet."}
        </EmptyState>
      ) : (
        // One surface (ADR 0036): the header strip above, the rows scrolling beneath it. The outer box keeps clear of the
        // floating issue panel (as the filter row does), so the inner box, whose own width decides the layout (`@container`),
        // narrows into the stacked rows instead of hiding its right-hand columns under the panel.
        <div
          className={`flex max-h-[65dvh] flex-col sm:max-h-none sm:min-h-0 ${panel.issueRef ? "sm:max-[1559px]:pr-[31rem]" : ""}`}
        >
          <div className="@container flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]">
            <IssueListHeader />
        <ScrollPanel label="Issue list" look="edges" onSurface className="min-h-0 flex-1 p-0">
        <ul>
          {issueRows.map(({ key, item: issue, state, index }) => (
            <IssueRow
              key={key}
              rowState={state}
              rowIndex={index}
              issue={issue}
              projectKey={project.key}
              assignee={issue.assigneeId ? <AssigneeAvatar organizationId={organization!.id} userId={issue.assigneeId} /> : null}
              labels={<LabelPills labels={issue.labels} activeIds={labelIds} onToggle={toggleLabel} className="relative z-10" />}
              onOpen={panel.open}
              onEdit={() => {
                setShowConflictNotice(false);
                setEditingIssueId(issue.id);
              }}
            />
          ))}
        </ul>
        {hasNextPage && (
          <Button
            variant="secondary"
            size="sm"
            className="m-3"
            disabled={isFetchingNextPage}
            onClick={() => void fetchNextPage()}
          >
            {isFetchingNextPage ? "Loading…" : "Load more"}
          </Button>
        )}
        </ScrollPanel>
          </div>
        </div>
      )}
      </div>
      {editingIssue && (
        <EditIssueDialog
          key={editingIssue.id}
          issue={editingIssue}
          issueKey={`${project.key}-${editingIssue.number}`}
          organizationId={organization!.id}
          projectId={project.id}
          onClose={() => setEditingIssueId(null)}
          onConflict={() => setShowConflictNotice(true)}
        />
      )}
      <IssuePanel project={project} />
    </Page>
  );
}
