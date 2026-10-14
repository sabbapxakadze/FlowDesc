import { describe, expect, it } from "vitest";
import { addScreenshots } from "./screenshots";

const file = (name: string, type: string, size = 100) => new File([new Uint8Array(size)], name, { type });

describe("adding screenshots to a bug report (ADR 0075)", () => {
  it("keeps pictures that fit and adds them after the ones already chosen", () => {
    // Why: the person can add pictures one at a time, and the order they chose is the order the owner sees.
    const first = file("a.png", "image/png");
    const second = file("b.jpg", "image/jpeg");
    expect(addScreenshots([first], [second])).toEqual({ files: [first, second], problem: null });
  });

  it("refuses a file that is not a PNG, JPEG or WebP, and says which", () => {
    // Why: the server turns these away too; telling the person now saves a failed send.
    const result = addScreenshots([], [file("notes.pdf", "application/pdf"), file("ok.webp", "image/webp")]);
    expect(result.files.map((f) => f.name)).toEqual(["ok.webp"]);
    expect(result.problem).toContain("notes.pdf");
  });

  it("refuses a picture over 5 MB and a fourth picture, keeping the rest", () => {
    // Why: the same limits as the server, so a report that would be refused is never sent.
    const big = file("big.png", "image/png", 5 * 1024 * 1024 + 1);
    expect(addScreenshots([], [big])).toMatchObject({ files: [], problem: expect.stringContaining("5 MB") });

    const three = [file("1.png", "image/png"), file("2.png", "image/png"), file("3.png", "image/png")];
    const full = addScreenshots(three, [file("4.png", "image/png")]);
    expect(full.files).toEqual(three);
    expect(full.problem).toContain("at most 3");
  });

  it("does not change the list it was given", () => {
    // Why: React state must be replaced, never mutated, or the screen would not update.
    const current = [file("a.png", "image/png")];
    addScreenshots(current, [file("b.png", "image/png")]);
    expect(current).toHaveLength(1);
  });
});
