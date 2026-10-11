import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import { parseCommentMarkdown } from "@flowdesk/contracts";
import { buildExtensions } from "./extensions";

/**
 * The editor's Markdown and keyboard behaviour (ADR 0056), in a simulated page. What these prove: the editor reads and writes the same Markdown
 * the comment card reads (including the @mention token), only the allowed formatting can exist in it, a link can only be a safe one, and the
 * shortcuts do what the toolbar says. Looks, focus and real typing are covered by the browser tests.
 */

const UUID = "0b9c1c3e-6f5a-4c2d-9a1b-2f3e4d5c6b7a";
const editors: Editor[] = [];
let linkShortcutPressed = 0;

function make(markdown = ""): Editor {
  const editor = new Editor({
    element: document.createElement("div"),
    extensions: buildExtensions({ onLinkShortcut: () => linkShortcutPressed++ }),
    content: markdown,
    contentType: "markdown",
  });
  editors.push(editor);
  return editor;
}

/** Presses a key combination on the editor, the way the browser delivers it. */
function press(editor: Editor, key: string, modifiers: { shift?: boolean } = {}) {
  editor.view.dom.dispatchEvent(
    new KeyboardEvent("keydown", {
      key,
      ctrlKey: true,
      shiftKey: modifiers.shift ?? false,
      bubbles: true,
      cancelable: true,
    }),
  );
}

afterEach(() => {
  while (editors.length) editors.pop()?.destroy();
  linkShortcutPressed = 0;
});

describe("Markdown in and out", () => {
  it("writes back the Markdown it was given for plain text, formatting, lists and a link", () => {
    // Why: a comment opened for editing and saved unchanged must not change.
    for (const md of [
      "plain words",
      "**bold** and *italic* and ~~gone~~ and `code`",
      "[the docs](https://example.com/docs)",
      "- one\n- two",
      "1. first\n2. second",
      "first paragraph\n\nsecond paragraph",
    ]) {
      expect(make(md).getMarkdown(), md).toBe(md);
    }
  });

  it("reads and writes the @mention token as a mention, byte for byte", () => {
    // Why: the server finds who to notify from this exact token (ADR 0033), so the editor must keep it unchanged.
    const token = `@[Anna Lee](user:${UUID})`;
    const editor = make(`Hi ${token}, and ${token}.`);
    expect(JSON.stringify(editor.getJSON())).toContain('"type":"mention"');
    expect(editor.getMarkdown()).toBe(`Hi ${token}, and ${token}.`);
  });

  it("a mention carries no formatting: bold around one is dropped, the mention and the text around it are kept", () => {
    // Why: named limit (ADR 0056). What matters is that nobody stops being notified and nothing else changes.
    const token = `@[Anna Lee](user:${UUID})`;
    const editor = make(`**big ${token} news**`);
    expect(editor.getMarkdown()).toContain(token);
    expect(editor.getMarkdown()).not.toContain(`**${token}**`);
    const marksOnMentions = () => {
      const found: number[] = [];
      editor.state.doc.descendants((node) => {
        if (node.type.name === "mention") found.push(node.marks.length);
      });
      return found;
    };
    expect(marksOnMentions()).toEqual([0]);
    // and Ctrl+B over a selection that includes the mention bolds the text around it, never the mention itself
    editor.commands.selectAll();
    editor.commands.toggleBold();
    expect(marksOnMentions()).toEqual([0]);
    expect(editor.getMarkdown()).toContain(token);
  });

  it("keeps a single new line as a line break, so a comment written before this feature does not lose its lines when it is edited", () => {
    // Why: the old text box stored line breaks as typed. Opening such a comment in the editor and saving must not glue its lines together.
    const editor = make("one\ntwo\n\nthree");
    const [first, second] = parseCommentMarkdown(editor.getMarkdown());
    expect(first).toEqual({
      type: "paragraph",
      children: [
        { type: "text", text: "one" },
        { type: "break" },
        { type: "text", text: "two" },
      ],
    });
    expect(second).toEqual({
      type: "paragraph",
      children: [{ type: "text", text: "three" }],
    });
  });

  it("an empty editor, or one emptied by the writer, is an empty string", () => {
    // Why: the form refuses an empty comment by testing this string.
    expect(make("").getMarkdown()).toBe("");
    const editor = make("something");
    editor.commands.selectAll();
    editor.commands.deleteSelection();
    expect(editor.getMarkdown().trim()).toBe("");
  });

  it("a token that is not a valid mention stays plain text", () => {
    const md = "@[Anna](user:not-a-uuid)";
    expect(JSON.stringify(make(md).getJSON())).not.toContain('"type":"mention"');
  });

  it("whatever the editor writes, the comment card's reader reads back as the same text", () => {
    // Why: the two halves are separate code (a library here, our own reader there). Literal stars, underscores and brackets must survive the trip.
    const editor = make("");
    editor.commands.insertContent(
      "2 * 3 * 4, snake_case_name, [not a link], a\\b, 1. not a list",
    );
    const written = editor.getMarkdown();
    const [block] = parseCommentMarkdown(written);
    expect(block?.type).toBe("paragraph");
    const text =
      block?.type === "paragraph"
        ? block.children.map((c) => (c.type === "text" ? c.text : `<${c.type}>`)).join("")
        : "";
    expect(text).toBe("2 * 3 * 4, snake_case_name, [not a link], a\\b, 1. not a list");
  });
});

describe("only the allowed formatting can exist", () => {
  it("turns headings, quotes, code blocks, images and rules into plain text or nothing, never into those nodes", () => {
    // Why: the card cannot draw them (ADR 0056), so the editor must not be able to make them, by typing, by pasting or by loading an old body.
    const editor = make(
      "# Title\n\n> quoted\n\n```\ncode block\n```\n\n![alt](https://example.com/x.png)\n\n---",
    );
    const types = new Set<string>();
    editor.state.doc.descendants((node) => void types.add(node.type.name));
    expect(
      [...types].every((t) =>
        [
          "doc",
          "paragraph",
          "text",
          "hardBreak",
          "bulletList",
          "orderedList",
          "listItem",
          "mention",
        ].includes(t),
      ),
      [...types].join(),
    ).toBe(true);
  });

  it("never makes a link with an unsafe address, whether loaded or set by a command", () => {
    // Why: the security promise of the feature. The reader refuses such links when drawing; the editor must not hold one either.
    const loaded = make("[bad](javascript:alert(1))");
    expect(JSON.stringify(loaded.getJSON())).not.toContain('"type":"link"');

    const editor = make("some text");
    editor.commands.selectAll();
    editor.commands.setLink({ href: "javascript:alert(1)" });
    expect(JSON.stringify(editor.getJSON())).not.toContain('"type":"link"');
    editor.commands.selectAll();
    editor.commands.setLink({ href: "https://example.com" });
    expect(JSON.stringify(editor.getJSON())).toContain('"type":"link"');
  });

  it("a link with a title, or an unsafe address, loads as the text it was (the card reads neither as a link)", () => {
    expect(
      JSON.stringify(make('[a](https://example.com "title")').getJSON()),
    ).not.toContain('"type":"link"');
    expect(make("[bad](javascript:alert(1))").getMarkdown()).toContain(
      "javascript:alert(1)",
    );
  });

  it("keeps HTML typed into the editor as text, not as markup", () => {
    const editor = make("");
    editor.commands.insertContent("<script>window.__pwned=1</script>");
    expect(editor.view.dom.querySelector("script")).toBeNull();
    expect(editor.getMarkdown()).toContain("script");
  });
});

describe("the shortcuts do what the toolbar says", () => {
  const cases: [string, string, boolean | undefined, string][] = [
    ["Ctrl+B", "b", undefined, "bold"],
    ["Ctrl+I", "i", undefined, "italic"],
    ["Ctrl+E", "e", undefined, "code"],
    ["Ctrl+Shift+X", "x", true, "strike"],
  ];
  for (const [name, key, shift, mark] of cases) {
    it(`${name} toggles ${mark} on the selection`, () => {
      const editor = make("word");
      editor.commands.selectAll();
      press(editor, key, { shift });
      expect(editor.isActive(mark), name).toBe(true);
      press(editor, key, { shift });
      expect(editor.isActive(mark), `${name} again`).toBe(false);
    });
  }

  it("Ctrl+Shift+8 makes a bulleted list and Ctrl+Shift+7 a numbered one", () => {
    const editor = make("item");
    press(editor, "8", { shift: true });
    expect(editor.isActive("bulletList")).toBe(true);
    press(editor, "7", { shift: true });
    expect(editor.isActive("orderedList")).toBe(true);
  });

  it("Ctrl+Shift+K asks for the link box, and plain Ctrl+K does nothing here (it stays the search palette's)", () => {
    const editor = make("word");
    press(editor, "k");
    expect(linkShortcutPressed).toBe(0);
    press(editor, "k", { shift: true });
    expect(linkShortcutPressed).toBe(1);
  });
});

describe("pictures (ADR 0062)", () => {
  const image = `![shot.png](attachment:${UUID})`;

  it("reads and writes a stored picture byte for byte, and the comment card's reader agrees it is a picture", () => {
    // Why: a comment opened for editing and saved unchanged must keep its pictures, and the editor must hold exactly what the reader draws.
    const md = `Look

${image}

here`;
    const editor = make(md);
    expect(JSON.stringify(editor.getJSON())).toContain('"type":"inlineImage"');
    expect(editor.getMarkdown()).toBe(md);
    expect(JSON.stringify(parseCommentMarkdown(md))).toContain('"type":"image"');
  });

  it("a picture written on the same line as text is moved onto its own line", () => {
    // Why: owner's rule: text and a picture never share a line, even for a body stored that way.
    expect(
      make(`Look ${image} here`)
        .getMarkdown()
        .split("\n\n")
        .map((part) => part.trim()),
    ).toEqual(["Look", image, "here"]);
  });

  it("writes nothing for a picture that is still uploading, so a half-finished picture is never stored", () => {
    // Why: only a ready picture has an id the server can link; a placeholder in the stored text would be refused at posting.
    const editor = make("before ");
    editor.commands.insertContent({
      type: "inlineImage",
      attrs: { alt: "x.png", src: "blob:x", status: "uploading", uploadId: "u1" },
    });
    expect(editor.getMarkdown()).not.toContain("attachment:");
    expect(editor.getMarkdown()).not.toContain("blob:");
  });

  it("does not make a picture from an outside address", () => {
    // Why: same rule as the reader: only our own files, never a link to elsewhere.
    expect(JSON.stringify(make("![x](https://evil.test/x.png)").getJSON())).not.toContain(
      "inlineImage",
    );
  });
});
