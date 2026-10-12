import { mergeAttributes, Node, type AnyExtension } from "@tiptap/core";
import { Markdown } from "@tiptap/markdown";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import HardBreak from "@tiptap/extension-hard-break";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Strike from "@tiptap/extension-strike";
import Code from "@tiptap/extension-code";
import Link from "@tiptap/extension-link";
import { BulletList, ListItem, OrderedList } from "@tiptap/extension-list";
import Mention from "@tiptap/extension-mention";
import { Placeholder, UndoRedo } from "@tiptap/extensions";
import type { SuggestionOptions } from "@tiptap/suggestion";
import {
  inlineImageToken,
  inlineImageTokenAt,
  isSafeLinkUrl,
  mentionTokenAt,
  mentionToken,
} from "@flowdesc/contracts";

/**
 * The editor's building blocks for formatted comments (ADR 0056). Only what comments allow is listed, so a heading, a quote or a code block
 * can never be made, typed with a shortcut, or pasted in (a picture only as our own `inlineImage`, from a file, ADR 0062): ProseMirror throws away anything its schema does not have.
 *
 * The editor reads and writes the SAME Markdown subset the comment card reads (`parseCommentMarkdown` in the contracts package), including the
 * @mention token (ADR 0033): a mention is its own node here, written back as `@[Name](user:<id>)`.
 */

/** The mention as a node that reads and writes the stored token. The picker (`suggestion`) is supplied by the editor component. */
export function mentionExtension(suggestion?: Partial<SuggestionOptions>) {
  return Mention.extend({
    markdownTokenName: "mention",
    markdownTokenizer: {
      name: "mention",
      level: "inline",
      start: "@[",
      tokenize(src: string) {
        const found = mentionTokenAt(src, 0);
        if (!found) return undefined;
        return {
          type: "mention",
          raw: src.slice(0, found.end),
          id: found.userId,
          label: found.name,
        };
      },
    },
    parseMarkdown(token, helpers) {
      return helpers.createNode("mention", { id: token.id, label: token.label });
    },
    renderMarkdown(node) {
      return mentionToken(String(node.attrs?.id ?? ""), String(node.attrs?.label ?? ""));
    },
  }).configure({
    HTMLAttributes: { class: "font-medium" },
    renderText: ({ node }) => `@${node.attrs.label ?? ""}`,
    renderHTML: ({ options, node }) => [
      "span",
      mergeAttributes(options.HTMLAttributes, { "data-mention": node.attrs.id }),
      `@${node.attrs.label ?? ""}`,
    ],
    suggestion: { char: "@", allowSpaces: false, ...suggestion },
  });
}

/**
 * A picture pasted or dropped into the box (ADR 0062). While its file uploads it shows the local copy (`src` is a blob address) and
 * `status` is "uploading"; when the upload ends `attachmentId` is set, `src` becomes the stored file's address and `status` is "ready".
 * Only a ready picture is written to the stored text, as `![name](attachment:<id>)`; one still uploading writes nothing (the form waits for it).
 * `lookup` gives the address of a file already stored, for a comment opened for editing.
 */
export function inlineImageExtension(
  lookup: (attachmentId: string) => string | undefined,
) {
  return Node.create({
    name: "inlineImage",
    // A block, not part of a line: text and a picture never share a line (ADR 0062).
    group: "block",
    atom: true,
    draggable: false,
    addAttributes() {
      return {
        attachmentId: { default: null },
        alt: { default: "" },
        src: { default: "" },
        status: { default: "ready" },
        uploadId: { default: null },
      };
    },
    parseHTML() {
      return [{ tag: "img[data-inline-image]" }];
    },
    renderHTML({ node }) {
      return [
        "img",
        {
          "data-inline-image": "",
          "data-status": node.attrs.status,
          src: node.attrs.src,
          alt: node.attrs.alt,
          draggable: "false",
          class:
            "my-1 block max-h-40 max-w-full rounded-[var(--radius-control)] border border-[var(--color-border-default)] data-[status=uploading]:opacity-50",
        },
      ];
    },
    markdownTokenName: "inlineImage",
    markdownTokenizer: {
      name: "inlineImage",
      level: "block",
      // Where a picture starts, so a paragraph is cut there; a "![" that is not one of ours (an outside address) is not a start.
      start(src: string) {
        for (let i = src.indexOf("!["); i !== -1; i = src.indexOf("![", i + 1)) {
          if (inlineImageTokenAt(src, i)) return i;
        }
        return -1;
      },
      tokenize(src: string) {
        const found = inlineImageTokenAt(src, 0);
        if (!found) return undefined;
        return {
          type: "inlineImage",
          raw: src.slice(0, found.end),
          id: found.attachmentId,
          label: found.alt,
        };
      },
    },
    parseMarkdown(token, helpers) {
      const id = String(token.id);
      return helpers.createNode("inlineImage", {
        attachmentId: id,
        alt: String(token.label ?? ""),
        src: lookup(id) ?? "",
        status: "ready",
      });
    },
    renderMarkdown(node) {
      const { attachmentId, alt, status } = node.attrs ?? {};
      return status === "ready" && attachmentId
        ? inlineImageToken(String(attachmentId), String(alt ?? ""))
        : "";
    },
  });
}

export function buildExtensions(options: {
  placeholder?: string;
  /** The address of a stored picture by its id (for a comment opened for editing). */
  imageUrl?: (attachmentId: string) => string | undefined;
  /** Called by the link shortcut (Ctrl+Shift+K); the component opens its link box. */
  onLinkShortcut: () => void;
  suggestion?: Partial<SuggestionOptions>;
}): AnyExtension[] {
  return [
    Document,
    Paragraph,
    Text,
    HardBreak,
    Bold,
    Italic,
    // Ctrl+Shift+X (the default, Ctrl+Shift+S, is the browser's and many apps' "save as").
    Strike.extend({
      addKeyboardShortcuts() {
        return { "Mod-Shift-x": () => this.editor.commands.toggleStrike() };
      },
    }),
    Code,
    Link.extend({
      // Loading a body: a link the reader would refuse to draw (unsafe address, or a title, which the reader does not read) stays the text it was.
      parseMarkdown(token, helpers) {
        if (!isSafeLinkUrl(String(token.href ?? "")) || token.title)
          return helpers.createTextNode(String(token.raw ?? ""));
        return helpers.applyMark("link", helpers.parseInline(token.tokens || []), {
          href: token.href,
          title: null,
        });
      },
      // Ctrl+K stays the app's search palette; the link shortcut is Ctrl+Shift+K.
      addKeyboardShortcuts() {
        return {
          "Mod-Shift-k": () => {
            options.onLinkShortcut();
            return true;
          },
        };
      },
    }).configure({
      openOnClick: false,
      autolink: false,
      linkOnPaste: false,
      // The same check as the reader, so the editor can never hold a link the card would refuse to draw.
      isAllowedUri: (url) => isSafeLinkUrl(url),
      HTMLAttributes: {
        target: "_blank",
        rel: "noopener noreferrer nofollow ugc",
        class: "underline underline-offset-2",
      },
    }),
    BulletList,
    OrderedList,
    ListItem,
    UndoRedo,
    Placeholder.configure({ placeholder: options.placeholder ?? "" }),
    mentionExtension(options.suggestion),
    inlineImageExtension(options.imageUrl ?? (() => undefined)),
    Markdown,
  ];
}
