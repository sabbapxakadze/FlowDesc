import { describe, expect, it } from "vitest";
import type { AskSource } from "@flowdesc/contracts";
import { describeLimits, parseSourceKey, splitAnswer } from "./answer";

const sources: AskSource[] = [
  { n: 1, key: "WEB-1", title: "One", status: "todo" },
  { n: 2, key: "WEB-2", title: "Two", status: "done" },
];

describe("splitAnswer", () => {
  // Why: the panel draws a chip where the model wrote [S1]; the text around it must come out in order and untouched.
  it("turns citations into source parts and keeps the text between them", () => {
    const parts = splitAnswer("Login fails [S1] and sign-up too [S2][S1].", sources);
    expect(parts.map((p) => (p.kind === "text" ? p.text : `<${p.source.key}>`))).toEqual(["Login fails ", "<WEB-1>", " and sign-up too ", "<WEB-2>", "<WEB-1>", "."]);
  });

  // Why: a marker for a source that was never sent must not become a link to something else.
  it("leaves a number that is not a source as plain text", () => {
    const parts = splitAnswer("See [S9].", sources);
    expect(parts).toEqual([{ kind: "text", text: "See [S9]." }]);
  });

  // Why: HTML in an answer is shown as the characters it is, never run (it is drawn as React text, so here it simply stays a string).
  it("passes other text through unchanged", () => {
    expect(splitAnswer("<img src=x onerror=alert(1)>", sources)).toEqual([{ kind: "text", text: "<img src=x onerror=alert(1)>" }]);
  });
});

describe("parseSourceKey", () => {
  it("reads a key and refuses anything else", () => {
    expect(parseSourceKey("WEB-12")).toEqual({ projectKey: "WEB", number: 12 });
    expect(parseSourceKey("../x")).toBeNull();
    expect(parseSourceKey("WEB-")).toBeNull();
  });
});

describe("describeLimits", () => {
  it("names the window the person is counted in", () => {
    expect(describeLimits({ remaining: 7, limit: 10, window: "hour" })).toBe("7 of 10 questions left this hour");
    expect(describeLimits({ remaining: 0, limit: 30, window: "day" })).toBe("0 of 30 questions left today");
    expect(describeLimits({ remaining: 3, limit: 5, window: "demo" })).toBe("3 of 5 questions left in this demo");
  });
});
