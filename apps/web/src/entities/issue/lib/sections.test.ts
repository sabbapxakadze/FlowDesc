import { describe, expect, it } from "vitest";
import { loadedCountLabel, sectionPlan, summaryCount } from "./sections";

describe("which groups the Issues list draws and loads", () => {
  it("shows In progress, Todo, then Done, and does not load Done until it is open", () => {
    // Why: finished work is the biggest group by far, and a collapsed group must cost nothing. The order puts what is moving first.
    const closed = sectionPlan(undefined, false);
    expect(closed.show).toEqual(["in_progress", "todo", "done"]);
    expect(closed.flat).toBe(false);
    expect(closed.enabled).toEqual({ in_progress: true, todo: true, done: false });
    expect(sectionPlan(undefined, true).enabled.done).toBe(true);
  });

  it("draws one flat group for a status tab and loads only that one", () => {
    // Why: a tab (?status=todo) must behave like the old status filter: one request, one list, no headers, whatever the Done group is doing.
    for (const status of ["in_progress", "todo", "done"] as const) {
      const plan = sectionPlan(status, false);
      expect(plan.show).toEqual([status]);
      expect(plan.flat).toBe(true);
      expect(Object.entries(plan.enabled).filter(([, on]) => on).map(([name]) => name)).toEqual([status]);
    }
  });
});

describe("the numbers on the tabs and group headers", () => {
  it("reads Todo as what is open but not in progress", () => {
    // Why: the summary has no Todo number of its own: `open` is everything that is not done. Pinned against the demo project (12 open, 4 in progress, 18 done).
    const summary = { open: 12, inProgress: 4, done: 18 };
    expect(summaryCount(summary, "in_progress")).toBe(4);
    expect(summaryCount(summary, "todo")).toBe(8);
    expect(summaryCount(summary, "done")).toBe(18);
  });

  it("shows a loaded count with a plus while there is another page", () => {
    // Why: with a filter on, the real total is unknown. "25+" is honest; "25" would claim there are no more.
    expect(loadedCountLabel(4, false)).toBe("4");
    expect(loadedCountLabel(25, true)).toBe("25+");
    expect(loadedCountLabel(0, false)).toBe("0");
  });
});
