/**
 * Making the model's words safe to show (ADR 0077, decision 5). The panel shows the answer as plain text, never as HTML, Markdown, links or images, so a
 * planted "click here" or an image address meant to leak data has nothing to work with. This is a second line, applied before the text leaves the server:
 * links and images are removed, tags are removed, and citations are rebuilt so only numbers that really are sources survive.
 *
 * Pure, so every case is tested on its own.
 */

export const MAX_ANSWER_CHARACTERS = 2000;

export type CleanAnswer = { text: string; cited: number[] };

export function cleanAnswer(raw: string, sourceCount: number): CleanAnswer {
  let text = raw
    // Control characters out, but keep line breaks (an answer may have short paragraphs).
    // eslint-disable-next-line no-control-regex -- removing control characters is the point
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    // An image: removed whole. A Markdown link: only its words stay, never the address.
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    // Any address that is left, and anything that looks like an HTML tag.
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, "[link removed]")
    .replace(/<\/?[a-z!][^>]*>/gi, "");

  // Citations are rebuilt from the numbers, so "[S1, S2]" and "[s1]" become "[S1][S2]" and a number that is not a source ("[S9]") disappears.
  const cited: number[] = [];
  text = text.replace(/\[\s*(S\d+(?:\s*,\s*S?\d+)*)\s*\]/gi, (_match, group: string) => {
    const numbers = [...group.matchAll(/\d+/g)].map((m) => Number(m[0])).filter((n) => n >= 1 && n <= sourceCount);
    for (const n of numbers) if (!cited.includes(n)) cited.push(n);
    return numbers.map((n) => `[S${n}]`).join("");
  });

  text = text.replace(/[ \t]+/g, " ").replace(/ ?\n ?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length > MAX_ANSWER_CHARACTERS) text = `${text.slice(0, MAX_ANSWER_CHARACTERS - 1).trimEnd()}…`;
  return { text, cited };
}
