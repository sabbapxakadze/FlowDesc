import { describe, expect, it } from "vitest";
import { cleanAnswer, MAX_ANSWER_CHARACTERS } from "./ask.answer.js";

/**
 * Making the model's words safe to show (ADR 0077, decision 5). The panel shows the answer as plain text, so these checks are a second line: a model that
 * obeyed a planted instruction must still have nothing clickable, nothing that loads, and no citation that points at an issue that was never given to it.
 */

describe("citations", () => {
  it("rebuilds them from numbers, keeps only real sources, and says which were cited", () => {
    // Why: a planted "[S9]" or a model's own "[7]" must not point at an issue the model was never given, and "[S1, S2]" must become two chips.
    const result = cleanAnswer("Pricing is open [S1]. Footer is not [S9]. Both matter [s2, S1].", 2);
    expect(result.text).toBe("Pricing is open [S1]. Footer is not . Both matter [S2][S1].");
    expect(result.cited).toEqual([1, 2]);
  });

  it("leaves other bracketed text alone, and drops [S0]", () => {
    expect(cleanAnswer("See item [1] and [note] and [S0] here", 3).text).toBe("See item [1] and [note] and here");
  });
});

describe("links, images and markup", () => {
  it("removes addresses, images and the targets of Markdown links, keeping only the words", () => {
    // Why: an injected "click here" or an image address that carries data out must have nothing to work with, even before the panel's plain-text rendering.
    const dirty = "Open ![p](http://evil.example/p.png) [the docs](https://evil.example/login) or http://evil.example/x or www.evil.example now";
    const clean = cleanAnswer(dirty, 1).text;
    expect(clean).not.toMatch(/https?:|evil|www\./i);
    expect(clean).toContain("the docs");
    expect(clean).toContain("[link removed]");
  });

  it("removes HTML tags", () => {
    expect(cleanAnswer("Hi <script>alert(1)</script> <img src=x onerror=y> there", 1).text).toBe("Hi alert(1) there");
  });
});

describe("spacing and size", () => {
  it("removes control characters and tidies spacing, keeping short paragraphs", () => {
    expect(cleanAnswer("one\u0000  two\t\tthree\n\n\n\nfour \n five", 1).text).toBe("one two three\n\nfour\nfive");
  });

  it("cuts a very long answer at the limit, with an ellipsis, counted in it", () => {
    const text = cleanAnswer("word ".repeat(1000), 1).text;
    expect(text.length).toBeLessThanOrEqual(MAX_ANSWER_CHARACTERS);
    expect(text.endsWith("…")).toBe(true);
  });

  it("returns nothing when nothing is left, so the caller can treat it as a failed answer", () => {
    expect(cleanAnswer("   \n ", 1).text).toBe("");
    expect(cleanAnswer("![x](http://evil.example/y)", 1).text).toBe("");
  });
});
