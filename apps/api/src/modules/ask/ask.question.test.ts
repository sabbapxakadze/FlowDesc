import { describe, expect, it } from "vitest";
import { cleanQuestion, clip, parseQuestion, plainText, smallTalk, weekOf } from "./ask.question.js";

/**
 * Reading a question (ADR 0077). Pure functions, so every pattern is tested on its own: what it must catch and, as important, what it must leave alone.
 * A wrong match here costs a few extra sources, never a change of data, but a pattern that fires on ordinary words would bury the right issue.
 */

describe("issue keys in a question", () => {
  it("finds keys in any case, once each, and the first five at most", () => {
    // Why: "what happened on WEB-12?" must fetch that issue directly; lower case is how people type; a key repeated must not take two places.
    expect(parseQuestion("What happened on WEB-12 and web-3, and again WEB-12?").keys).toEqual([
      { projectKey: "WEB", number: 12, loose: false },
      { projectKey: "WEB", number: 3, loose: false },
    ]);
    const many = parseQuestion("A-1 B-2 C-3 D-4 E-5 F-6 G-7").keys;
    expect(many.map((k) => k.projectKey)).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("does not take ordinary hyphenated words, zero, or too many digits for a key", () => {
    // Why: "built-in", "x-ray-9" style words and "WEB-0" must not become lookups; a number past nine digits cannot exist (the by-number address refuses it).
    expect(parseQuestion("Is the built-in editor ready? Check WEB-0 and WEB-1234567890").keys).toEqual([]);
    expect(parseQuestion("covid-19 plans").keys).toEqual([{ projectKey: "COVID", number: 19, loose: false }]); // looks like a key, so it is looked up: a miss costs nothing
  });

  it("takes keys out of the text left to search", () => {
    // Why: the key is looked up on its own; searching "web" and "12" as words would only add noise.
    expect(parseQuestion("what happened on WEB-12 last week?").text).toBe("what happened on last week?");
  });
});

describe("a key typed without the dash", () => {
  const keysOf = (q: string, known: string[] = ["WEB", "API"]) => parseQuestion(q, known).keys.map((k) => `${k.projectKey}-${k.number}${k.loose ? " (loose)" : ""}`);

  it("understands web12, web 12, WEB_12, WEB#12 and web - 12 when WEB is a real project", () => {
    // Why: the owner typed "web12" and Ask answered as if no issue was named. These are the forms people actually type.
    for (const q of ["what is web12?", "what is web 12?", "what is WEB_12?", "what is WEB#12?", "what is web - 12?", "what is Web-12?"]) {
      expect(keysOf(q)[0], q).toMatch(/^WEB-12/);
    }
    expect(keysOf("compare api7 and web 12")).toEqual(["API-7 (loose)", "WEB-12 (loose)"]);
  });

  it("understands a copied dash: an en dash, an em dash or a non-breaking hyphen", () => {
    // Why: pasting a key from a chat or a document often swaps the hyphen for a typographic dash, and the key then looks different but means the same.
    for (const dash of ["–", "—", "‑", "−"]) expect(keysOf(`what is WEB${dash}12?`), dash).toEqual(["WEB-12"]); // en dash, em dash, non-breaking hyphen, minus
  });

  it("does not read ordinary words and numbers as a key unless that project exists", () => {
    // Why: only real project keys count for the loose forms, or "iOS 17" and "Windows 11" would become lookups.
    expect(keysOf("does iOS 17 break the layout? windows 11 too")).toEqual([]);
    expect(keysOf("how did the webpage 12 times fail")).toEqual([]); // "webpage" is not the key "web"
    expect(keysOf("web12", [])).toEqual([]); // no known projects: only the dashed form works
  });

  it("is a loose key only when no dashed form of it is typed, and takes it out of the text left to search", () => {
    // Why: a full "WEB-12" always counts as a key; the words of a key must not be searched as text.
    expect(keysOf("web12 and WEB-12")).toEqual(["WEB-12"]);
    expect(parseQuestion("what happened on web 12 last week?", ["WEB"]).text).toBe("what happened on last week?");
  });

  it("prefers the longer project key when two start alike", () => {
    // Why: with projects WEB and WEB2, "web2 5" names WEB2-5, not WEB-25.
    expect(keysOf("web2 5", ["WEB", "WEB2"])).toEqual(["WEB2-5 (loose)"]);
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

describe("questions about the workspace itself", () => {
  const overview = (q: string) => parseQuestion(q).intents.includes("overview");

  it("catches the ways people ask what statuses, priorities, projects or how many issues there are", () => {
    // Why: "what statuses do we have?" is not about any issue's text, so a text search finds nothing and the person was told "I could not find anything".
    for (const q of ["What statuses do we have?", "which status can an issue have", "how many issues are there?", "give me an overview", "What projects do we have?", "which priorities exist"]) {
      expect(overview(q), q).toBe(true);
    }
  });

  it("leaves ordinary text questions alone", () => {
    // Why: "status" inside a sentence about an issue ("the status page is broken") must still be searched as text, not turned into a count.
    for (const q of ["the status page is broken", "why is the project plan late", "who fixed the priority bug"]) {
      expect(overview(q), q).toBe(false);
    }
  });
});

describe("small talk", () => {
  it("catches a message that is only a greeting, a thanks or a request for help", () => {
    // Why: "hi" was answered "I could not find anything" (the owner's second real try). These get a fixed, free reply.
    for (const q of ["hi", "Hi!", "hello", "Hey there", "good morning", "help", "What can you do?", "what can I ask", "who are you?"]) expect(smallTalk(q), q).toBe("help");
    for (const q of ["thanks", "Thank you!", "ok", "great"]) expect(smallTalk(q), q).toBe("thanks");
  });

  it("leaves real questions alone, even when they start with a greeting or the word help", () => {
    // Why: the whole message must be small talk. Otherwise "help with the login bug" would never be searched.
    for (const q of ["help with the login bug", "hello, what is overdue?", "hi WEB-12", "what can you tell me about pricing", "who is assigned to login", "thanks for fixing WEB-4 so what is left"]) {
      expect(smallTalk(q), q).toBeNull();
    }
  });
});

describe("the A.5 question types", () => {
  const has = (q: string, intent: string) => (parseQuestion(q).intents as string[]).includes(intent);

  it("catches the usual wordings of workload, recent, urgent and unassigned", () => {
    // Why: these are the questions the owner tried and the model answered badly; each now has an exact answer from the database.
    for (const q of ["Who has the most open issues?", "who is the busiest", "show the workload", "issues per person", "who is working on what"]) expect(has(q, "workload"), q).toBe(true);
    for (const q of ["What changed recently?", "what's new", "latest updates", "what happened lately"]) expect(has(q, "recent"), q).toBe(true);
    for (const q of ["What is urgent?", "show high priority issues", "top-priority work"]) expect(has(q, "urgent"), q).toBe(true);
    for (const q of ["What is unassigned?", "which issues are not assigned", "issues without an assignee", "nobody is assigned to what"]) expect(has(q, "unassigned"), q).toBe(true);
  });

  it("leaves topic questions alone", () => {
    // Why: "who is working on login?" names a topic and must still be searched as text; "urgent" inside a sentence about a bug is a text question too in spirit,
    // but a wrong match only adds a few sources, so what matters is that the NAMED topics below are not turned into a workload or a list.
    expect(has("who is working on login?", "workload")).toBe(false);
    expect(has("what changed in WEB-12", "recent")).toBe(false);
    expect(has("the new logo is the priority", "urgent")).toBe(false);
    expect(has("assigned to me", "unassigned")).toBe(false);
  });
});
