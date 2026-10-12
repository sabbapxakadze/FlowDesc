import { mentionTokenAt } from "./mentions.js";

/**
 * Formatted comments (ADR 0056). A comment body is stored as a small subset of Markdown in the same text field as before, with the @mention
 * token (ADR 0033) kept as it is. This reader turns a body into a tree of nodes; the web app draws the tree as React elements.
 *
 * The safety rule is in the shape of the result: it can only hold text, formatting, code, mentions, breaks, lists and LINKS WITH A SAFE ADDRESS.
 * There is no node for HTML, images or anything else, so whatever a writer types (a `<script>`, an `onerror=`, a `javascript:` link) comes out as
 * plain text, and the drawing code never builds HTML from it. Plain comments written before this feature read as the plain text they were; the
 * cost is that a comment that happens to contain Markdown-looking characters (`**x**`, a line starting with `- `) now shows formatted.
 *
 * Supported: **bold**, *italic* or _italic_ (underscores only at word edges), ~~strikethrough~~, `code`, [label](https://address), bulleted and
 * numbered lists (one level), paragraphs, line breaks, and a backslash to write a marker literally. Not supported, on purpose: headings, quotes,
 * tables, nested lists, bare-address auto-links.
 *
 * Images (ADR 0062) are the one exception to "no images", always a block of their own, and only in the form `![name](attachment:<uuid>)`: a picture that is a file of our own,
 * named by its id. An image with any other address (`https://...`, `data:...`, a path) is not an image here; it stays the text and link it was. So
 * the reader still cannot be made to load anything from outside. Whether the id is a real file the writer may use is the server's check, not this one.
 */
export type Inline =
  | { type: "text"; text: string }
  | { type: "mention"; userId: string; name: string }
  | { type: "bold" | "italic" | "strike"; children: Inline[] }
  | { type: "code"; text: string }
  | { type: "link"; href: string; children: Inline[] }
  | { type: "image"; attachmentId: string; alt: string }
  | { type: "break" };

/** A picture is a block of its own (ADR 0062): text never shares its line, so a line that mixes the two is split around it. */
export type Block =
  | { type: "paragraph"; children: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "image"; attachmentId: string; alt: string };

/** Characters a backslash can make literal. */
const ESCAPABLE = "\\`*_{}[]()#+-.!~|<>";

/**
 * An absolute http, https or mailto address with no spaces or control characters. Anything else is never made into a link. Checked with a
 * pattern, not by parsing the address, so the answer is the same in the browser and on the server (and this package needs no URL type).
 */
export function isSafeLinkUrl(url: string): boolean {
  // eslint-disable-next-line no-control-regex -- control characters are exactly what this refuses
  if (!url || /[\s\u0000-\u001f\u007f]/.test(url)) return false;
  return /^https?:\/\/[^/?#]/i.test(url) || /^mailto:[^@\s]+@[^@\s]+$/i.test(url);
}

const isSpace = (c: string | undefined) => c === undefined || /\s/.test(c);
const isWordChar = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}]/u.test(c);

/** Where the closing marker of an emphasis run starts, or -1. The content must be non-empty and not start or end with a space. */
function findClose(s: string, marker: "**" | "~~" | "*" | "_", from: number): number {
  for (let k = s.indexOf(marker, from); k !== -1; k = s.indexOf(marker, k + 1)) {
    if (s[k - 1] === "\\") continue; // an escaped marker
    const content = s.slice(from, k);
    if (
      content.length === 0 ||
      isSpace(content[0]) ||
      isSpace(content[content.length - 1])
    )
      continue;
    const after = s[k + marker.length];
    if (marker === "**" || marker === "~~") {
      if (after === marker[0]) continue; // take the END of a run of markers, so ***x*** closes the bold last
    } else if (marker === "*") {
      if (after === "*" || s[k - 1] === "*") continue; // a single star, not part of **
    } else if (isWordChar(after)) {
      continue; // _ only closes at the end of a word, so snake_case_names stay as written
    }
    if (marker === "_" && (s[k - 1] === "_" || after === "_")) {
      continue; // part of a run of underscores (__init__, window.__x): never a closing marker
    }
    return k;
  }
  return -1;
}

const ATTACHMENT_REF =
  /^attachment:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** The most pictures one comment may hold (ADR 0062). */
export const MAX_INLINE_IMAGES = 10;

/**
 * `![name](attachment:<uuid>)` starting at the `!` at `i`: where it ends, the file's id (lower case) and the name, or undefined when it is not
 * exactly that. Shared with the editor, so the editor and the reader can never disagree about what a picture is.
 */
export function inlineImageTokenAt(
  s: string,
  i: number,
): { end: number; attachmentId: string; alt: string } | undefined {
  if (s[i] !== "!" || s[i + 1] !== "[") return undefined;
  const closeLabel = s.indexOf("]", i + 2);
  if (closeLabel === -1 || s[closeLabel + 1] !== "(") return undefined;
  const closeUrl = s.indexOf(")", closeLabel + 2);
  if (closeUrl === -1) return undefined;
  const ref = ATTACHMENT_REF.exec(s.slice(closeLabel + 2, closeUrl));
  if (!ref) return undefined;
  const alt = s
    .slice(i + 2, closeLabel)
    .replace(/\\(.)/g, (whole, ch: string) => (ESCAPABLE.includes(ch) ? ch : whole));
  return { end: closeUrl + 1, attachmentId: (ref[1] as string).toLowerCase(), alt };
}

/** The token written for a picture. The name cannot hold `[`, `]`, `\` or a line break (they would end the token early), so they become spaces. */
export function inlineImageToken(attachmentId: string, name: string): string {
  return `![${name.replace(/[[\]\\\r\n]/g, " ")}](attachment:${attachmentId})`;
}

/** `[label](address)` starting at `i`: the end and the node, or undefined when it is not a link with a safe address. */
function readLink(s: string, i: number, depth: number): { end: number; node: Inline } | undefined {
  const closeLabel = s.indexOf("]", i + 1);
  if (closeLabel <= i + 1 || s[closeLabel + 1] !== "(") return undefined;
  const closeUrl = s.indexOf(")", closeLabel + 2);
  if (closeUrl === -1) return undefined;
  const href = s.slice(closeLabel + 2, closeUrl);
  if (!isSafeLinkUrl(href)) return undefined;
  return {
    end: closeUrl + 1,
    node: { type: "link", href, children: parseInline(s.slice(i + 1, closeLabel), depth + 1) },
  };
}

/**
 * How many levels of emphasis or link label may sit inside each other. Deeper ones stay as the text they were. Each level rescans the text for
 * its closing marker, so a body of 10,000 stars (read as bold inside bold inside bold, 2,500 levels) took about a second: quadratic. Nobody writes
 * emphasis ten deep on purpose.
 */
const MAX_NESTING = 10;

/** One line of text into inline nodes. Anything that does not complete a construct stays as the text it was. */
function parseInline(s: string, depth = 0): Inline[] {
  const out: Inline[] = [];
  let text = "";
  const flush = () => {
    if (text) out.push({ type: "text", text });
    text = "";
  };
  let i = 0;
  while (i < s.length) {
    const c = s[i] as string;
    if (c === "\\" && i + 1 < s.length && ESCAPABLE.includes(s[i + 1] as string)) {
      text += s[i + 1];
      i += 2;
      continue;
    }
    if (c === "`") {
      const end = s.indexOf("`", i + 1);
      if (end > i + 1) {
        flush();
        out.push({ type: "code", text: s.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (c === "@") {
      const mention = mentionTokenAt(s, i);
      if (mention) {
        flush();
        out.push({ type: "mention", userId: mention.userId, name: mention.name });
        i = mention.end;
        continue;
      }
    }
    if (c === "!") {
      const image = inlineImageTokenAt(s, i);
      if (image) {
        flush();
        out.push({ type: "image", attachmentId: image.attachmentId, alt: image.alt });
        i = image.end;
        continue;
      }
    }
    if (c === "[") {
      const link = readLink(s, i, depth);
      if (link) {
        flush();
        out.push(link.node);
        i = link.end;
        continue;
      }
    }
    const marker = s.startsWith("**", i)
      ? "**"
      : s.startsWith("~~", i)
        ? "~~"
        : c === "*"
          ? "*"
          : c === "_"
            ? "_"
            : undefined;
    // A single _ opens italic only at a word edge and not inside a run of underscores (__init__).
    const underscoreCannotOpen =
      marker === "_" && (isWordChar(s[i - 1]) || s[i - 1] === "_" || s[i + 1] === "_");
    if (marker && !underscoreCannotOpen && depth < MAX_NESTING) {
      const start = i + marker.length;
      if (!isSpace(s[start])) {
        const close = findClose(s, marker, start);
        if (close !== -1) {
          flush();
          const children = parseInline(s.slice(start, close), depth + 1);
          out.push({
            type: marker === "**" ? "bold" : marker === "~~" ? "strike" : "italic",
            children,
          });
          i = close + marker.length;
          continue;
        }
      }
      text += marker; // an opening marker with no closing one is just those characters
      i = start;
      continue;
    }
    text += c;
    i++;
  }
  flush();
  return out;
}

const isBlank = (node: Inline) =>
  node.type === "break" || (node.type === "text" && node.text.trim() === "");

/** A paragraph's nodes into blocks: each picture on its own, the text before and after it as paragraphs (nothing but spaces or breaks is dropped). */
function splitAtImages(children: Inline[]): Block[] {
  const blocks: Block[] = [];
  let run: Inline[] = [];
  const flush = () => {
    while (run.length > 0 && run[0] && run[0].type === "break") run.shift();
    while (run.length > 0 && run[run.length - 1]?.type === "break") run.pop();
    // The space that sat between the text and the picture goes with the split.
    const first = run[0];
    if (first?.type === "text") run[0] = { type: "text", text: first.text.trimStart() };
    const last = run[run.length - 1];
    if (last?.type === "text") run[run.length - 1] = { type: "text", text: last.text.trimEnd() };
    if (run.some((node) => !isBlank(node)))
      blocks.push({ type: "paragraph", children: run });
    run = [];
  };
  for (const node of children) {
    if (node.type === "image") {
      flush();
      blocks.push({ type: "image", attachmentId: node.attachmentId, alt: node.alt });
    } else {
      run.push(node);
    }
  }
  flush();
  return blocks;
}

const BULLET = /^\s{0,3}[-*+]\s+(\S.*)$/;
const NUMBERED = /^\s{0,3}\d{1,9}[.)]\s+(\S.*)$/;

/** A whole comment body into blocks. */
export function parseCommentMarkdown(body: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | undefined;

  const endParagraph = () => {
    if (paragraph.length === 0) return;
    const children: Inline[] = [];
    paragraph.forEach((line, index) => {
      if (index > 0) children.push({ type: "break" });
      children.push(...parseInline(line));
    });
    blocks.push(...splitAtImages(children));
    paragraph = [];
  };
  const endList = () => {
    if (list)
      blocks.push({
        type: "list",
        ordered: list.ordered,
        items: list.items.map((item) => parseInline(item)), // not `.map(parseInline)`: map would pass the index as the depth
      });
    list = undefined;
  };

  for (const raw of body.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.replace(/\s+$/, "");
    if (line.trim() === "") {
      endParagraph();
      endList();
      continue;
    }
    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    const item = bullet ?? numbered;
    if (item) {
      endParagraph();
      const ordered = numbered !== null;
      if (list && list.ordered !== ordered) endList();
      list ??= { ordered, items: [] };
      list.items.push(item[1] as string);
      continue;
    }
    endList();
    paragraph.push(line);
  }
  endParagraph();
  endList();
  return blocks;
}

/** The ids of the pictures a body shows, each once, in order of first appearance. Read with the same reader, so it can never disagree with what is drawn. */
export function inlineImageIds(body: string): string[] {
  const ids: string[] = [];
  const walk = (nodes: Inline[]) => {
    for (const node of nodes) {
      if (node.type === "image") {
        if (!ids.includes(node.attachmentId)) ids.push(node.attachmentId);
      } else if ("children" in node) walk(node.children);
    }
  };
  for (const block of parseCommentMarkdown(body)) {
    if (block.type === "paragraph") walk(block.children);
    else if (block.type === "image")
      walk([{ type: "image", attachmentId: block.attachmentId, alt: block.alt }]);
    else block.items.forEach(walk);
  }
  return ids;
}
