import { describe, expect, it } from "vitest";
import { formatDueDate } from "../../../shared/lib/dueDate";
import { sentenceCase, sprintRange } from "./sprintText";

// The day names themselves follow the browser's language (that is formatDueDate's job, checked there), so these tests compare with it instead of
// with English text: they pass on any machine.
const day = (value: string, today: string) => formatDueDate(value, today);

describe("what a sprint says about its dates", () => {
  it("writes both dates, one date, or that there are none", () => {
    // Why: both dates are optional when a sprint is created, and the card must never print "null" or an empty gap for the ones left out.
    const today = "2026-10-12";
    expect(sprintRange("2026-09-28", "2026-10-12", today)).toBe(`${day("2026-09-28", today)} - ${day("2026-10-12", today)}`);
    expect(sprintRange("2026-10-19", null, today)).toBe(`Starts ${day("2026-10-19", today)}`);
    expect(sprintRange(null, "2026-10-12", today)).toBe(`Ends ${day("2026-10-12", today)}`);
    expect(sprintRange(null, null, today)).toBe("No dates yet");
  });

  it("adds the year only to a date that is not in the current year", () => {
    // Why: a sprint that ran across New Year would otherwise read as two bare day names with no hint of which years.
    const text = sprintRange("2025-12-28", "2026-01-10", "2026-01-05");
    const [from, to] = text.split(" - ");
    expect(from).toContain("2025");
    expect(to).not.toContain("2026");
  });

  it("starts a sentence with a capital", () => {
    expect(sentenceCase("ends today")).toBe("Ends today");
    expect(sentenceCase("")).toBe("");
  });
});
