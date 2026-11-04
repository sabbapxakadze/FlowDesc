import { describe, expect, it } from "vitest";
import { cleanQuestion, clip, parseQuestion, plainText, weekOf } from "./ask.question.js";

/**
 * Reading a question (ADR 0077). Pure functions, so every pattern is tested on its own: what it must catch and, as important, what it must leave alone.
 * A wrong match here costs a few extra sources, never a change of data, but a pattern that fires on ordinary words would bury the right issue.
 */

describe("issue keys in a question", () => {
  it("finds keys in any case, once each, and the first five at most", () => {
    // Why: "what happened on WEB-12?" must fetch that issue directly; lower case is how people type; a key repeated must not take two places.
    expect(parseQuestion("What happened on WEB-12 and web-3, and again WEB-12?").keys).toEqual([
      { projectKey: "WEB", number: 12 },
      { projectKey: "WEB", number: 3 },
    ]);
    const many = parseQuestion("A-1 B-2 C-3 D-4 E-5 F-6 G-7").keys;
    expect(many.map((k) => k.projectKey)).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("does not take ordinary hyphenated words, zero, or too many digits for a key", () => {
    // Why: "built-in", "x-ray-9" style words and "WEB-0" must not become lookups; a number past nine digits cannot exist (the by-number address refuses it).
    expect(parseQuestion("Is the built-in editor ready? Check WEB-0 and WEB-1234567890").keys).toEqual([]);
    expect(parseQuestion("covid-19 plans").keys).toEqual([{ projectKey: "COVID", number: 19 }]); // looks like a key, so it is looked up: a miss costs nothing
  });

  it("takes keys out of the text left to search", () => {
    // Why: the key is looked up on its own; searching "web" and "12" as words would only add noise.
    expect(parseQuestion("what happened on WEB-12 last week?").text).toBe("what happened on last week?");
  });
});

describe("the four fixed question types", () => {
  const intents = (q: string) => parseQuestion(q).intents;

  it("recognises each type in the ways people ask it", () => {
    // Why: these questions cannot be answered by matching words, so they are answered by the app's own queries instead.
    expect(intents("What is overdue?")).toEqual(["overdue"]);
    expect(intents("anything past due or behind schedule")).toEqual(["overdue"]);
    expect(intents("What is due today?")).toEqual(["dueToday"]);
    expect(intents("today's deadlines")).toEqual(["dueToday"]);
    expect(intents("What is due this week?")).toEqual(["dueWeek"]);
    expect(intents("which deadlines this week are at risk")).toEqual(["dueWeek"]);
    expect(intents("What is assigned to me?")).toEqual(["assignedToMe"]);
    expect(intents("show my open issues")).toEqual(["assignedToMe"]);
    expect(intents("what is on my plate")).toEqual(["assignedToMe"]);
    expect(intents("What is in progress right now?")).toEqual(["inProgress"]);
    expect(intents("what's in-progress")).toEqual(["inProgress"]);
  });

  it("can recognise several at once, and none in an ordinary question", () => {
    expect(intents("What is overdue and in progress?")).toEqual(["overdue", "inProgress"]);
    expect(intents("Why did we change the login flow?")).toEqual([]);
  });

  it("leaves alone words that only look similar", () => {
    // Why: "overdue" inside another word, "working on", "progress" alone and "my" in an ordinary sentence must stay ordinary text.
    expect(intents("Who is working on the login screen?")).toEqual([]);
    expect(intents("Is there progress on the migration?")).toEqual([]);
    expect(intents("Where is my login screen design?")).toEqual([]);
    expect(intents("the overdueness of the report")).toEqual([]);
    expect(intents("assigned to Meredith")).toEqual([]);
  });

  it("takes the matched phrases out of the text left to search", () => {
    // Why: otherwise "what is overdue" would also search for the word "overdue" and fill the result with issues that merely say it.
    expect(parseQuestion("What is overdue in the checkout flow?").text).toBe("What is in the checkout flow?");
    expect(parseQuestion("What is overdue?").text).toBe("What is ?");
  });

  it("is not confused by being asked twice in a row (global patterns keep a position)", () => {
    // Why: the patterns are global regular expressions; a leftover position would make the second question miss.
    expect(parseQuestion("what is overdue").intents).toEqual(["overdue"]);
    expect(parseQuestion("what is overdue").intents).toEqual(["overdue"]);
  });
});

describe("small helpers", () => {
  it("cleans control characters and spacing", () => {
    expect(cleanQuestion("  what\u0000 is\n\n  overdue\t? \u001f")).toBe("what is overdue ?");
  });

  it("finds Monday to Sunday of any day, including a Sunday and a month boundary", () => {
    // Why: "this week" must mean the same week as the My work page and the MCP server.
    expect(weekOf("2026-11-04")).toEqual({ from: "2026-11-02", to: "2026-11-08" }); // a Wednesday
    expect(weekOf("2026-11-08")).toEqual({ from: "2026-11-02", to: "2026-11-08" }); // a Sunday
    expect(weekOf("2026-11-02")).toEqual({ from: "2026-11-02", to: "2026-11-08" }); // a Monday
    expect(weekOf("2026-09-30")).toEqual({ from: "2026-09-28", to: "2026-10-04" }); // across a month
  });

  it("reduces Markdown tokens for reading: pictures dropped, mentions to the name", () => {
    // Why: a model should read "@Ada", not an id, and a picture token is noise (ADR 0063).
    const id = "11111111-2222-3333-4444-555555555555";
    expect(plainText(`See ![shot](attachment:${id}) with @[Ada Lovelace](user:${id}) please`)).toBe("See with @Ada Lovelace please");
  });

  it("clips to a length, counting the ellipsis", () => {
    expect(clip("short", 10)).toBe("short");
    expect(clip("abcdefghij", 5)).toBe("abcd…");
    expect(clip("abcdefghij", 5)).toHaveLength(5);
  });
});
