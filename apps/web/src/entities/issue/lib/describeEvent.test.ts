import { describe, expect, it } from "vitest";
import type { IssueEvent } from "@flowdesk/contracts";
import { describeEventFor } from "./describeEvent";

const ME = "11111111-1111-4111-8111-111111111111";
const event = (type: string, payload: Record<string, unknown>) =>
  ({ type, payload }) as unknown as IssueEvent;

describe("a description that mentions the viewer (ADR 0063)", () => {
  it("reads 'mentioned you in the description' for a new issue and for an edit of the description, only for the person mentioned", () => {
    // Why: the notification bell and My work show this sentence; without it a mention in a description would read "created this issue" and give no hint why you were told.
    expect(
      describeEventFor(event("issue.created", { title: "T", mentions: [ME] }), ME),
    ).toBe("mentioned you in the description");
    expect(
      describeEventFor(event("issue.updated", { description: "x", mentions: [ME] }), ME),
    ).toBe("mentioned you in the description");
    expect(
      describeEventFor(
        event("issue.created", { title: "T", mentions: [ME] }),
        "someone-else",
      ),
    ).toBe("created this issue");
  });

  it("an update that did not change the description keeps its own sentence", () => {
    // Why: `mentions` only ever travels with a description change, but the sentence must not depend on that staying true.
    expect(
      describeEventFor(event("issue.updated", { priority: "high", mentions: [ME] }), ME),
    ).toBe("changed priority to High");
  });
});
