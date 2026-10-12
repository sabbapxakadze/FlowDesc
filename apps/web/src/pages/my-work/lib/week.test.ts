import { describe, expect, it } from "vitest";
import type { AssignedIssue } from "@flowdesc/contracts";
import { bucketIssues, mondayOf, summarize, weekStartFromParam } from "./week";

// 2026-10-12 is a Monday, 2026-10-18 the Sunday after it.
const issue = (key: string, dueDate: string | null, status: AssignedIssue["status"] = "todo"): AssignedIssue => ({
  id: key,
  number: 1,
  title: key,
  status,
  priority: "none",
  dueDate,
  projectId: "p",
  projectKey: "WEB",
  projectName: "Website",
  updatedAt: "2026-10-12T08:00:00.000Z",
});

describe("mondayOf", () => {
  it("finds the Monday for every day of the week, Sunday included", () => {
    // Why: weeks run Monday to Sunday, and Sunday is the day a naive getDay() maths puts in the NEXT week.
    for (const day of ["2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18"]) {
      expect(mondayOf(day)).toBe("2026-10-12");
    }
    expect(mondayOf("2026-10-19")).toBe("2026-10-19");
  });

  it("crosses a month and a year", () => {
    // Why: the date arithmetic is done on a real calendar, not on day numbers.
    expect(mondayOf("2026-11-01")).toBe("2026-10-26");
    expect(mondayOf("2027-01-01")).toBe("2026-12-28");
  });
});

describe("weekStartFromParam", () => {
  it("uses the Monday of a real day and falls back to this week for anything else", () => {
    // Why: ?week= is typed into the address bar by anyone; a bad value must show this week, not crash or show nonsense.
    expect(weekStartFromParam("2026-10-21", "2026-10-12")).toBe("2026-10-19");
    expect(weekStartFromParam(null, "2026-10-14")).toBe("2026-10-12");
    expect(weekStartFromParam("garbage", "2026-10-14")).toBe("2026-10-12");
    expect(weekStartFromParam("2026-02-31", "2026-10-14")).toBe("2026-10-12");
  });
});

describe("bucketIssues", () => {
  const today = "2026-10-14"; // a Wednesday
  const weekStart = "2026-10-12";

  it("sorts issues into overdue, the days of the shown week, no date, and other weeks", () => {
    // Why: the page is built from these groups. Today and the Sunday count as inside the week; yesterday is overdue AND still sits in its own
    // day row (so the calendar shows where it was due); the next Monday is another week, and an issue with no date is never overdue.
    const buckets = bucketIssues(
      [issue("late", "2026-10-13"), issue("today", "2026-10-14"), issue("sunday", "2026-10-18"), issue("next", "2026-10-19"), issue("none", null)],
      today,
      weekStart,
    );
    expect(buckets.overdue.map((i) => i.id)).toEqual(["late"]);
    expect(buckets.byDay.get("2026-10-13")?.map((i) => i.id)).toEqual(["late"]);
    expect(buckets.byDay.get("2026-10-14")?.map((i) => i.id)).toEqual(["today"]);
    expect(buckets.byDay.get("2026-10-18")?.map((i) => i.id)).toEqual(["sunday"]);
    expect(buckets.byDay.has("2026-10-19")).toBe(false);
    expect(buckets.undated.map((i) => i.id)).toEqual(["none"]);
    expect(buckets.elsewhere).toBe(1);
  });

  it("browsing a past week shows its overdue issues in their day rows, and does not count them as 'in other weeks'", () => {
    // Why: the owner could not see issues overdue since Oct 2 to 4 anywhere in the calendar. Going back a week must show them on their days.
    const issues = [issue("friday", "2026-10-09"), issue("old", "2026-10-02"), issue("ahead", "2026-10-20")];
    const lastWeek = bucketIssues(issues, today, "2026-10-05");
    expect(lastWeek.byDay.get("2026-10-09")?.map((i) => i.id)).toEqual(["friday"]);
    expect(lastWeek.byDay.has("2026-10-02")).toBe(false); // an even older week
    expect(lastWeek.elsewhere).toBe(1); // only "ahead": "old" is overdue and listed on the right
    expect(lastWeek.overdue.map((i) => i.id)).toEqual(["old", "friday"]);
  });

  it("lists overdue issues earliest first, and browsing another week does not move them", () => {
    // Why: the most overdue item is the one to do first; and the overdue list is about today, not about the week on screen.
    const issues = [issue("b", "2026-10-13"), issue("a", "2026-10-01")];
    expect(bucketIssues(issues, today, weekStart).overdue.map((i) => i.id)).toEqual(["a", "b"]);
    expect(bucketIssues(issues, today, "2026-10-26").overdue.map((i) => i.id)).toEqual(["a", "b"]);
  });
});

describe("summarize", () => {
  const today = "2026-10-14";

  it("counts overdue, due this week (today included) and in progress, and names where to start", () => {
    // Why: this is the sentence at the top of the page. Due today counts as this week, not as overdue; the issue to start
    // with is the earliest overdue one, else the earliest due this week.
    const issues = [issue("late", "2026-10-10"), issue("today", "2026-10-14", "in_progress"), issue("friday", "2026-10-16"), issue("next", "2026-10-20")];
    const summary = summarize(issues, today);
    expect(summary).toMatchObject({ overdue: 1, dueThisWeek: 2, inProgress: 1 });
    expect(summary.startWith?.id).toBe("late");
    expect(summarize([issue("friday", "2026-10-16"), issue("today", "2026-10-14")], today).startWith?.id).toBe("today");
    expect(summarize([issue("none", null)], today).startWith).toBeNull();
  });
});
