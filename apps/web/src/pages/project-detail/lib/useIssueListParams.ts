import { useSearchParams } from "react-router";
import type { IssuePriority, IssueStatus } from "@flowdesc/contracts";
import { isUuid } from "../../../shared/lib/paths";
import { todayKey } from "../../../shared/lib/dueDate";
import { useTimezone } from "../../../shared/lib/timezone";
import { PRIORITY_ORDER } from "../../../shared/ui";

const STATUS_VALUES: IssueStatus[] = ["todo", "in_progress", "done"];

function isIssueStatus(value: string | null): value is IssueStatus {
  return value !== null && (STATUS_VALUES as string[]).includes(value);
}

function isIssuePriority(value: string | null): value is IssuePriority {
  return value !== null && (PRIORITY_ORDER as string[]).includes(value);
}

/**
 * The Issues list's filters and sort, read from and written to the address. The URL is the source of truth, not component state: a
 * bookmarked or reloaded `?status=...&priority=...` address reproduces the same view. Omitted params mean "all" / newest first, matching
 * the API's own defaults (see listIssuesQuerySchema). The toolbar and the page both call this; it is the address that they share.
 */
export function useIssueListParams() {
  const [searchParams, setSearchParams] = useSearchParams();

  const statusParam = searchParams.get("status");
  const status = isIssueStatus(statusParam) ? statusParam : undefined;
  const priorityParam = searchParams.get("priority");
  const priority = isIssuePriority(priorityParam) ? priorityParam : undefined;
  const dueParam = searchParams.get("due");
  const due: "overdue" | "none" | undefined = dueParam === "overdue" || dueParam === "none" ? dueParam : undefined;
  // "Overdue" is judged against the person's own calendar day, the same one the overdue marker on each row uses.
  const timezone = useTimezone();
  const today = due === "overdue" ? todayKey(timezone) : undefined;
  // A user id or "unassigned". Not validated against the member list: an id that matches nobody simply returns an empty list, and the API
  // rejects a non-uuid.
  const assigneeParam = searchParams.get("assignee");
  const assignee = assigneeParam && assigneeParam !== "" ? assigneeParam : undefined;
  // The chosen labels (?label=a&label=b): an issue must have ALL of them. Anything that is not an id is ignored.
  const labelIds = [...new Set(searchParams.getAll("label").filter(isUuid))];
  const sort: "priority" | undefined = searchParams.get("sort") === "priority" ? "priority" : undefined;
  const order: "asc" | undefined = searchParams.get("order") === "asc" ? "asc" : undefined;
  // The four choices the dropdown offers: newest first (the default, nothing in the URL), oldest first (?order=asc), highest priority
  // first (?sort=priority) and lowest priority first (?sort=priority&order=asc: the API flips the whole key, so "no priority" comes
  // first, then low, medium, high, urgent, oldest first within each).
  const sortChoice = sort === "priority" ? (order === "asc" ? "priority-low" : "priority") : order === "asc" ? "oldest" : "newest";

  function setParam(name: string, value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === "") next.delete(name);
      else next.set(name, value);
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

  return {
    status,
    priority,
    due,
    today,
    assignee,
    labelIds,
    sort,
    order,
    sortChoice,
    /** Anything narrowing the list besides the status tab: when true, the totals of the project no longer describe what is shown. */
    otherFiltersOn: Boolean(priority || due || assignee || labelIds.length > 0),
    setStatus: (value: string) => setParam("status", value),
    setPriority: (value: string) => setParam("priority", value),
    setDue: (value: string) => setParam("due", value),
    setAssignee: (value: string) => setParam("assignee", value),
    setLabelIds,
    toggleLabel: (id: string) => setLabelIds(labelIds.includes(id) ? labelIds.filter((x) => x !== id) : [...labelIds, id]),
    setSortChoice,
  };
}
