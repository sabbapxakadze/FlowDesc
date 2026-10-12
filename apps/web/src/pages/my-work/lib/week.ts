import type { AssignedIssue } from "@flowdesc/contracts";
import { addDays } from "../../../shared/lib/dueDate";

/**
 * The calendar maths behind the My work agenda. Everything works on plain "YYYY-MM-DD" days (the person's own day, ADR 0032),
 * never on moments, so no timezone or daylight-saving change can move an issue to another day. Weeks run Monday to Sunday.
 */

/** The Monday of the week that contains `day`. */
export function mondayOf(day: string): string {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 is Sunday
  return addDays(day, -((weekday + 6) % 7));
}

/** The Monday to show: the week of `?week=` when it is a real day, else this week's. A bad value never breaks the page. */
export function weekStartFromParam(param: string | null, today: string): string {
  if (param && /^\d{4}-\d{2}-\d{2}$/.test(param)) {
    const date = new Date(`${param}T00:00:00Z`);
    // Round trip: "2026-02-31" parses in some engines but does not come back the same.
    if (!Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === param) return mondayOf(param);
  }
  return mondayOf(today);
}

export type WeekBuckets = {
  /** Open issues whose day is before today, earliest first: listed on the right of the page, and also in their own day row when that day is in the shown week. */
  overdue: AssignedIssue[];
  /** Every dated issue inside the shown week, by day (overdue ones included, so browsing back shows where they were due). */
  byDay: Map<string, AssignedIssue[]>;
  /** No due date. */
  undated: AssignedIssue[];
  /** Due today or later, but in another week than the shown one (overdue issues of other weeks are not counted: they are on the right). */
  elsewhere: number;
};

export function bucketIssues(issues: AssignedIssue[], today: string, weekStart: string): WeekBuckets {
  const weekEnd = addDays(weekStart, 6);
  const buckets: WeekBuckets = { overdue: [], byDay: new Map(), undated: [], elsewhere: 0 };
  for (const issue of issues) {
    const due = issue.dueDate;
    if (due === null) {
      buckets.undated.push(issue);
      continue;
    }
    if (due < today) buckets.overdue.push(issue);
    if (due >= weekStart && due <= weekEnd) buckets.byDay.set(due, [...(buckets.byDay.get(due) ?? []), issue]);
    else if (due >= today) buckets.elsewhere += 1;
  }
  buckets.overdue.sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : a.dueDate! > b.dueDate! ? 1 : 0));
  return buckets;
}

export type Summary = { overdue: number; dueThisWeek: number; inProgress: number; startWith: AssignedIssue | null };

/** The header sentence's numbers, always about THIS week (not the one being browsed). `startWith` is the earliest-due overdue issue, else the earliest due this week. */
export function summarize(issues: AssignedIssue[], today: string): Summary {
  const weekEnd = addDays(mondayOf(today), 6);
  const dated = issues.filter((issue): issue is AssignedIssue & { dueDate: string } => issue.dueDate !== null).sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : 0));
  const overdue = dated.filter((issue) => issue.dueDate < today);
  const thisWeek = dated.filter((issue) => issue.dueDate >= today && issue.dueDate <= weekEnd);
  return {
    overdue: overdue.length,
    dueThisWeek: thisWeek.length,
    inProgress: issues.filter((issue) => issue.status === "in_progress").length,
    startWith: overdue[0] ?? thisWeek[0] ?? null,
  };
}

/** "12 to 18 October", or "28 October to 3 November" when the week spans two months. Written for the browser's language. */
export function formatWeekRange(weekStart: string): string {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(`${addDays(weekStart, 6)}T00:00:00Z`);
  const withMonth = new Intl.DateTimeFormat(undefined, { timeZone: "UTC", day: "numeric", month: "long" });
  const dayOnly = new Intl.DateTimeFormat(undefined, { timeZone: "UTC", day: "numeric" });
  const sameMonth = start.getUTCMonth() === end.getUTCMonth();
  return `${sameMonth ? dayOnly.format(start) : withMonth.format(start)} to ${withMonth.format(end)}`;
}
