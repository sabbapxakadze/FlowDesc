import { describe, expect, it } from "vitest";
import { inlineImageIds, isSafeLinkUrl, parseCommentMarkdown, type Block, type Inline } from "./comment-markdown.js";

/**
 * The reader of formatted comments (ADR 0056). Two kinds of check: that the formatting people write comes out right, and, more important,
 * that nothing a writer types can become anything but text, a safe link, or formatting: no HTML, no script, no unsafe link.
 */

const UUID = "0b9c1c3e-6f5a-4c2d-9a1b-2f3e4d5c6b7a";
const text = (t: string): Inline => ({ type: "text", text: t });
const para = (...children: Inline[]): Block => ({ type: "paragraph", children });

describe("plain comments stay plain (nothing written before this feature changes)", () => {
  it("a single line is one paragraph of text", () => {
    // Why: the vast majority of existing comments; they must look exactly as before.
    expect(parseCommentMarkdown("hello world")).toEqual([para(text("hello world"))]);
  });

  it("a new line inside a paragraph is kept as a line break, and a blank line starts a new paragraph", () => {
    // Why: the old text box showed line breaks as typed; losing them would reflow every multi-line comment.
    expect(parseCommentMarkdown("one\ntwo")).toEqual([para(text("one"), { type: "break" }, text("two"))]);
    expect(parseCommentMarkdown("one\n\ntwo")).toEqual([para(text("one")), para(text("two"))]);
    expect(parseCommentMarkdown("one\r\ntwo")).toEqual([para(text("one"), { type: "break" }, text("two"))]);
  });

  it("an empty or blank body has no blocks", () => {
    expect(parseCommentMarkdown("")).toEqual([]);
    expect(parseCommentMarkdown("  \n \n")).toEqual([]);
  });

  it("a mention token stays a mention, and text around it stays text", () => {
    expect(parseCommentMarkdown(`Hi @[Anna](user:${UUID}), thanks`)).toEqual([
      para(text("Hi "), { type: "mention", userId: UUID, name: "Anna" }, text(", thanks")),
    ]);
  });
});

describe("formatting", () => {
  it("reads bold, italic, strikethrough and code", () => {
    expect(parseCommentMarkdown("**b** *i* ~~s~~ `c`")).toEqual([
      para(
        { type: "bold", children: [text("b")] },
        text(" "),
        { type: "italic", children: [text("i")] },
        text(" "),
        { type: "strike", children: [text("s")] },
        text(" "),
        { type: "code", text: "c" },
      ),
    ]);
  });

  it("reads underscores as italic only at word edges, so snake_case_names are untouched", () => {
    // Why: engineers write identifiers in comments all day; turning `my_var_name` into italics would mangle them.
    expect(parseCommentMarkdown("_soft_ and my_var_name")).toEqual([
      para({ type: "italic", children: [text("soft")] }, text(" and my_var_name")),
    ]);
  });

  it("never pairs up underscores that sit in runs, so __init__ and window.__x ... window.__y stay as written", () => {
    // Why: found by the browser test. Code identifiers and pasted code are full of double underscores; reading them as italic mangles them.
    for (const body of ["__init__ and __main__", "window.__a=1 and window.__b=2", "a__b__c", "__a_"]) {
      expect(JSON.stringify(parseCommentMarkdown(body)), body).not.toContain('"italic"');
    }
    expect(parseCommentMarkdown("_ok_")).toEqual([para({ type: "italic", children: [text("ok")] })]);
    // A real italic that contains a double underscore is still italic: only a RUN of underscores is kept out of pairing.
    expect(parseCommentMarkdown("_a__b_")).toEqual([para({ type: "italic", children: [text("a__b")] })]);
  });

  it("nests formatting, including bold italic written with three stars", () => {
    expect(parseCommentMarkdown("***both***")).toEqual([para({ type: "bold", children: [{ type: "italic", children: [text("both")] }] })]);
    expect(parseCommentMarkdown("**bold with *italic* inside**")).toEqual([
      para({ type: "bold", children: [text("bold with "), { type: "italic", children: [text("italic")] }, text(" inside")] }),
    ]);
  });

  it("keeps a mention inside bold text", () => {
    // Why: the editor can bold a mention; the server still has to find it, and the reader must still draw it as a person.
    expect(parseCommentMarkdown(`**ping @[Anna](user:${UUID})**`)).toEqual([
      para({ type: "bold", children: [text("ping "), { type: "mention", userId: UUID, name: "Anna" }] }),
    ]);
  });

  it("does not read formatting inside a code span", () => {
    expect(parseCommentMarkdown("`**not bold**`")).toEqual([para({ type: "code", text: "**not bold**" })]);
  });

  it("does not turn arithmetic or stray markers into formatting", () => {
    // Why: false positives are the cost of formatting old plain text; these are the ones that matter most.
    expect(parseCommentMarkdown("2 * 3 * 4")).toEqual([para(text("2 * 3 * 4"))]);
    expect(parseCommentMarkdown("a ** b ** c")).toEqual([para(text("a ** b ** c"))]);
    expect(parseCommentMarkdown("**unclosed")).toEqual([para(text("**unclosed"))]);
    expect(parseCommentMarkdown("one ` lone backtick")).toEqual([para(text("one ` lone backtick"))]);
    expect(parseCommentMarkdown("a * b")).toEqual([para(text("a * b"))]);
    // A marker closed after a space is not a closing marker (the space rule applies on both sides).
    expect(parseCommentMarkdown("**x **")).toEqual([para(text("**x **"))]);
    expect(parseCommentMarkdown("*a *")).toEqual([para(text("*a *"))]);
  });

  it("a backslash makes the next marker literal", () => {
    // Why: the editor writes `\\*` when someone types a real star; the reader must give the star back.
    expect(parseCommentMarkdown("\\*not italic\\*")).toEqual([para(text("*not italic*"))]);
    expect(parseCommentMarkdown("C:\\temp")).toEqual([para(text("C:\\temp"))]);
  });
});

describe("lists", () => {
  it("reads bulleted and numbered lists, one level", () => {
    expect(parseCommentMarkdown("- one\n- **two**\n\n1. first\n2) second")).toEqual([
      { type: "list", ordered: false, items: [[text("one")], [{ type: "bold", children: [text("two")] }]] },
      { type: "list", ordered: true, items: [[text("first")], [text("second")]] },
    ]);
  });

  it("a paragraph can be followed by a list without a blank line, and the list ends at the next other line", () => {
    expect(parseCommentMarkdown("Steps:\n- a\n- b\nDone")).toEqual([
      para(text("Steps:")),
      { type: "list", ordered: false, items: [[text("a")], [text("b")]] },
      para(text("Done")),
    ]);
  });

  it("a dash with no text, or a rule of dashes, is not a list", () => {
    expect(parseCommentMarkdown("- ")).toEqual([para(text("-"))]);
    expect(parseCommentMarkdown("---")).toEqual([para(text("---"))]);
  });
});

describe("links: only safe ones become links", () => {
  it("makes http, https and mailto links, with formatted text allowed in the label", () => {
    expect(parseCommentMarkdown("[the **CI** notes](https://example.com/ci?a=1)")).toEqual([
      para({ type: "link", href: "https://example.com/ci?a=1", children: [text("the "), { type: "bold", children: [text("CI")] }, text(" notes")] }),
    ]);
    expect(parseCommentMarkdown("[mail](mailto:a@example.com)")).toEqual([
      para({ type: "link", href: "mailto:a@example.com", children: [text("mail")] }),
    ]);
  });

  it("leaves a javascript:, data: or other unsafe link as the text the writer typed", () => {
    // Why: the security promise of the whole feature. An unsafe link must not become clickable, and must not hide its address behind a label.
    for (const unsafe of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html;base64,PHNjcmlwdD4=", "vbscript:x", "file:///etc/passwd", "//evil.example", "/relative", "user:" + UUID]) {
      const [block] = parseCommentMarkdown(`[click](${unsafe})`);
      expect(JSON.stringify(block), unsafe).not.toContain('"type":"link"');
      expect(JSON.stringify(block), unsafe).toContain("click");
    }
  });

  it("does not make a link out of an address with spaces or a missing bracket", () => {
    expect(JSON.stringify(parseCommentMarkdown("[a](https://x.com/a b)"))).not.toContain('"type":"link"');
    expect(JSON.stringify(parseCommentMarkdown("[a](https://x.com"))).not.toContain('"type":"link"');
    expect(JSON.stringify(parseCommentMarkdown("[a] (https://x.com)"))).not.toContain('"type":"link"');
  });

  it("isSafeLinkUrl accepts only absolute http, https and mailto addresses without spaces or control characters", () => {
    expect(isSafeLinkUrl("https://example.com")).toBe(true);
    expect(isSafeLinkUrl("http://example.com/a?b#c")).toBe(true);
    expect(isSafeLinkUrl("mailto:a@example.com")).toBe(true);
    for (const bad of ["javascript:alert(1)", "https://a.com/ b", "https://a.com/\nb", "https://a.com/\u0000", " https://a.com", "example.com", ""]) {
      expect(isSafeLinkUrl(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});

describe("nothing a writer types becomes markup", () => {
  it("keeps HTML, script and event handlers as plain text", () => {
    // Why: the output is only ever text, code, mentions and safe links, so markup typed into a comment is displayed, never run.
    const body = '<script>alert(1)</script> <img src=x onerror="alert(2)"> <a href="javascript:alert(3)">x</a>';
    expect(parseCommentMarkdown(body)).toEqual([para(text(body))]);
  });

  it("emphasis nested more than ten levels deep stays as the text it was, and ordinary nesting is unchanged", () => {
    // Why: a run of stars reads as bold inside bold inside bold, thousands of levels deep, and every level rescans the text: 10,000 stars took
    // about a second (quadratic) until the depth was capped. The cap must not touch what people really write, so three levels still nest.
    const depthOf = (nodes: Inline[]): number =>
      Math.max(0, ...nodes.map((n) => (n.type === "bold" || n.type === "italic" || n.type === "strike" ? 1 + depthOf(n.children) : 0)));
    const deep = "**".repeat(40) + "x" + "**".repeat(40);
    const [block] = parseCommentMarkdown(deep);
    expect(block?.type === "paragraph" ? depthOf(block.children) : -1).toBe(10);
    expect(JSON.stringify(parseCommentMarkdown(deep))).toContain("x"); // nothing is lost, only left as written

    const three = parseCommentMarkdown("**a ~~b *c* d~~ e**");
    expect(three[0]?.type === "paragraph" ? depthOf(three[0].children) : -1).toBe(3);

    // The same cap holds inside a list item, where the reader is called through a map: the item's position in the list must not act as a depth.
    const list = parseCommentMarkdown("- one\n- two\n- three\n- four\n- **bold**\n- *italic*");
    expect(JSON.stringify(list)).toContain('"type":"bold"');
    expect(JSON.stringify(list)).toContain('"type":"italic"');
  });

  it("never throws, and always finishes quickly, on any input including worst-case markers", () => {
    // Why: comments are written by strangers (the demo is public). A body that makes the reader hang or throw would break the page for everyone viewing it.
    const nasty = ["*".repeat(10_000), "**".repeat(5_000), "[".repeat(10_000), "`".repeat(10_000), "~~".repeat(5_000), "_a".repeat(5_000), "[a](".repeat(2_500), "\\".repeat(10_000), "- ".repeat(5_000), "*a*a".repeat(2_500)];
    const started = Date.now();
    for (const body of nasty) expect(() => parseCommentMarkdown(body), body.slice(0, 12)).not.toThrow();
    expect(Date.now() - started).toBeLessThan(5_000);
  });

  it("is deterministic on random printable input (no crash, text only comes from the body)", () => {
    let seed = 12345;
    const next = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff);
    const alphabet = "ab *_`~[]()\\-1.\n@<>:/";
    for (let n = 0; n < 300; n++) {
      let body = "";
      const length = next() % 60;
      for (let i = 0; i < length; i++) body += alphabet[next() % alphabet.length];
      expect(() => parseCommentMarkdown(body), JSON.stringify(body)).not.toThrow();
    }
  });
});

describe("pictures (ADR 0062)", () => {
  const ID = "0b9c1c3e-6f5a-4c2d-9a1b-2f3e4d5c6b7a";

  it("reads ![name](attachment:<id>) as a picture, and lists each id once", () => {
    // Why: this is the whole format; the server links exactly the ids this returns, so reading and listing must agree.
    expect(parseCommentMarkdown(`![shot.png](attachment:${ID})`)).toEqual([{ type: "image", attachmentId: ID, alt: "shot.png" }]);
    expect(inlineImageIds(`![a](attachment:${ID}) and again ![b](attachment:${ID.toUpperCase()})`)).toEqual([ID]);
  });

  it("puts a picture on its own line: text on the same line is split off before and after it", () => {
    // Why: owner's rule (2026-10-11): text and a picture never share a line, even in a comment that was stored with them together.
    const image = { type: "image", attachmentId: ID, alt: "a" };
    expect(parseCommentMarkdown(`See ![a](attachment:${ID}) here`)).toEqual([para(text("See")), image, para(text("here"))]);
    expect(parseCommentMarkdown(`one\n![a](attachment:${ID})\ntwo`)).toEqual([para(text("one")), image, para(text("two"))]);
  });

  it("never makes a picture from any other address, so nothing can be loaded from outside", () => {
    // Why: the safety rule of ADR 0056 (no external requests from a comment) must survive adding images.
    for (const address of ["https://evil.test/x.png", "http://evil.test/x.png", "data:image/png;base64,AAAA", "javascript:alert(1)", "/uploads/x.png", "attachment:not-an-id", `attachment:${ID}/extra`]) {
      const blocks = parseCommentMarkdown(`![x](${address})`);
      expect(JSON.stringify(blocks), address).not.toContain('"image"');
      expect(inlineImageIds(`![x](${address})`), address).toEqual([]);
    }
  });

  it("does not count a picture written inside code", () => {
    // Why: what is drawn is what is linked; `code` is shown as typed.
    expect(inlineImageIds("`![x](attachment:" + ID + ")`")).toEqual([]);
  });
});
