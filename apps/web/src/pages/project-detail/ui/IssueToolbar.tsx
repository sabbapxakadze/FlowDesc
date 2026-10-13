import type { IssueStatus } from "@flowdesc/contracts";
import { memberOptions, useMembers } from "../../../entities/member";
import { useLabels } from "../../../entities/label";
import { NewIssueButton } from "../../../features/create-issue";
import { useAuth } from "../../../shared/auth/useAuth";
import { cn, Dropdown, PRIORITY_OPTIONS } from "../../../shared/ui";
import { useIssueListParams } from "../lib/useIssueListParams";

const TABS: { value: IssueStatus | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "in_progress", label: "In progress" },
  { value: "todo", label: "Todo" },
  { value: "done", label: "Done" },
];

/**
 * The one-line toolbar above the Issues list (ADR 0072): New issue, the status tabs, then the quiet filters and the sort. The tabs are the
 * status filter (`?status=`), so an old address with a status in it still selects its tab. `counts` are the exact totals of the project,
 * passed only while no other filter is on (with a filter they would describe the whole project, not what is shown), and tabs then show
 * no number. `data-panel-trigger`: working the filters while an issue is open in the side panel must not close it.
 */
export function IssueToolbar({ projectId, counts }: { projectId: string; counts: Record<IssueStatus | "", number> | null }) {
  const { organization, user } = useAuth();
  const params = useIssueListParams();
  const { data: members } = useMembers(organization!.id);
  const { data: orgLabels } = useLabels(organization!.id);

  return (
    // The toolbar does not make room for the floating issue panel any more (owner, 2026-10-14, ADR 0073): the panel overlays its right-hand end.
    <div data-panel-trigger data-tour="issue-filters" className="mt-4 mb-3 flex flex-wrap items-center gap-x-1 gap-y-2">
      <NewIssueButton organizationId={organization!.id} projectId={projectId} />

      <div role="group" aria-label="Status" className="ml-2 inline-flex gap-0.5 rounded-[var(--radius-control)] bg-[var(--color-border-default)]/55 p-0.5 text-sm">
        {TABS.map((tab) => {
          const active = (params.status ?? "") === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              aria-pressed={active}
              onClick={() => params.setStatus(tab.value)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-[var(--radius-control)] px-2.5 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--color-border-focus)]",
                active
                  ? "bg-[var(--color-bg-surface)] font-semibold text-[var(--color-text-default)] shadow-sm"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-default)]",
              )}
            >
              {tab.label}
              {counts && <span className="text-xs font-normal opacity-75">{counts[tab.value]}</span>}
            </button>
          );
        })}
      </div>

      <div className="ml-auto flex flex-wrap items-center gap-x-0.5">
        <Dropdown
          quiet
          emptyLabel="Priority"
          aria-label="Filter by priority"
          className="w-auto"
          value={params.priority ?? ""}
          onChange={params.setPriority}
          options={[{ value: "", label: "All priorities" }, ...PRIORITY_OPTIONS]}
        />
        <Dropdown
          quiet
          emptyLabel="Due"
          aria-label="Filter by due date"
          className="w-auto"
          value={params.due ?? ""}
          onChange={params.setDue}
          options={[
            { value: "", label: "Any due date" },
            { value: "overdue", label: "Overdue" },
            { value: "none", label: "No due date" },
          ]}
        />
        <Dropdown
          quiet
          emptyLabel="Assignee"
          aria-label="Filter by assignee"
          className="w-auto"
          value={params.assignee ?? ""}
          onChange={params.setAssignee}
          options={[
            { value: "", label: "Anyone" },
            { value: "unassigned", label: "Unassigned" },
            // "Assigned to me" is just the signed-in user's own id.
            ...(user ? [{ value: user.id, label: "Assigned to me" }] : []),
            ...memberOptions(members?.filter((member) => member.userId !== user?.id)),
          ]}
        />
        <Dropdown
          quiet
          emptyLabel="Labels"
          aria-label="Filter by label"
          multiple
          className="w-auto"
          placeholder="All labels"
          values={params.labelIds}
          onToggle={params.toggleLabel}
          onClear={() => params.setLabelIds([])}
          options={(orgLabels ?? []).map((label) => ({
            value: label.id,
            label: label.name,
            icon: <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: label.color }} />,
          }))}
        />
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-[var(--color-border-default)]" />
        <Dropdown
          quiet
          aria-label="Sort"
          className="w-auto"
          value={params.sortChoice}
          onChange={params.setSortChoice}
          options={[
            { value: "newest", label: "Newest first" },
            { value: "oldest", label: "Oldest first" },
            { value: "priority", label: "Highest priority first" },
            { value: "priority-low", label: "Lowest priority first" },
          ]}
        />
      </div>
    </div>
  );
}
