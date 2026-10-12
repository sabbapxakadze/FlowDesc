import type { ReactNode } from "react";
import type { AssignedIssue } from "@flowdesc/contracts";
import { addDays } from "../../../shared/lib/dueDate";
import { Button, ScrollPanel, cn } from "../../../shared/ui";
import { formatWeekRange, type WeekBuckets } from "../lib/week";
import { IssueTile } from "./IssueTile";

const TODAY_TINT = "border-[var(--color-border-focus)] bg-[color-mix(in_oklab,var(--color-accent-500)_10%,transparent)]";
const weekday = new Intl.DateTimeFormat(undefined, { timeZone: "UTC", weekday: "short" });
const dayMonth = new Intl.DateTimeFormat(undefined, { timeZone: "UTC", day: "numeric", month: "short" });
const at = (day: string) => new Date(`${day}T00:00:00Z`);

function TileGrid({ children }: { children: ReactNode }) {
  // A lone tile takes the whole row (two columns), so a long title is not squeezed into half of it.
  return <ul className="grid flex-1 gap-2 @2xl:grid-cols-2 [&>li:only-child]:@2xl:col-span-2">{children}</ul>;
}

/**
 * The week as an agenda: one row per day, Monday to Friday always and Saturday and Sunday only when something is due or it is today,
 * then the issues with no due date. Every dated issue sits in its own day, overdue ones included (with the red chip); the overdue ones are also listed on the right.
 * The days scroll inside their own area. The week being shown is
 * moved with Previous / Today / Next, which the page keeps in the address (`?week=`).
 */
export function WeekAgenda({
  buckets,
  weekStart,
  today,
  thisMonday,
  fit,
  onOpen,
  onWeekChange,
}: {
  buckets: WeekBuckets;
  weekStart: string;
  today: string;
  thisMonday: string;
  /** Scroll inside the window instead of stretching the page (a wide screen). */
  fit: boolean;
  onOpen: (issueKey: string) => void;
  /** A Monday to show, or null for this week. */
  onWeekChange: (monday: string | null) => void;
}) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)).filter(
    (day, index) => index < 5 || day === today || (buckets.byDay.get(day)?.length ?? 0) > 0,
  );
  // An overdue issue also shows the red "Overdue" chip in its day row, so the row says why it is there.
  const tile = (issue: AssignedIssue) => <IssueTile key={issue.id} issue={issue} showDue={issue.dueDate !== null && issue.dueDate < today} onOpen={onOpen} />;
  return (
    <section aria-label="Assigned to me" data-tour="my-week">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">
          {weekStart === thisMonday ? "This week" : weekStart === addDays(thisMonday, 7) ? "Next week" : weekStart === addDays(thisMonday, -7) ? "Last week" : "Week of"}{" "}
          <span className="font-normal text-[var(--color-text-muted)]">{formatWeekRange(weekStart)}</span>
        </h2>
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" variant="secondary" onClick={() => onWeekChange(addDays(weekStart, -7))}>
            Previous
          </Button>
          <Button type="button" size="sm" variant="secondary" disabled={weekStart === thisMonday} onClick={() => onWeekChange(null)}>
            Today
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => onWeekChange(addDays(weekStart, 7))}>
            Next
          </Button>
        </div>
      </div>

      <ScrollPanel label="Week and issues" fitWindow={fit} bottomGap={40} className="@container overflow-x-hidden">
      <div className="space-y-2">
        {days.map((day) => {
          const issues = buckets.byDay.get(day) ?? [];
          const isToday = day === today;
          return (
            <div key={day} className={cn("flex gap-3 rounded-[var(--radius-card)] border p-3", isToday ? TODAY_TINT : "border-[var(--color-border-default)]")}>
              <div className="w-16 shrink-0">
                <p className="text-sm font-semibold">{weekday.format(at(day))}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{isToday ? "Today" : dayMonth.format(at(day))}</p>
              </div>
              {issues.length === 0 ? <p className="self-center text-xs text-[var(--color-text-muted)]">{day < today ? "Nothing open was due" : "Nothing due"}</p> : <TileGrid>{issues.map((issue) => tile(issue))}</TileGrid>}
            </div>
          );
        })}
      </div>

      {buckets.elsewhere > 0 && (
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">
          {buckets.elsewhere} more {buckets.elsewhere === 1 ? "is" : "are"} due in other weeks.
        </p>
      )}

      {buckets.undated.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 flex items-baseline gap-2 text-sm font-semibold">
            No due date <span className="font-normal text-[var(--color-text-muted)]">{buckets.undated.length}</span>
          </h3>
          <TileGrid>{buckets.undated.map((issue) => tile(issue))}</TileGrid>
        </div>
      )}
      </ScrollPanel>
    </section>
  );
}
