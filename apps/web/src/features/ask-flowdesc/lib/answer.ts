import type { AskLimits, AskSource } from "@flowdesc/contracts";

export type AnswerPart = { kind: "text"; text: string } | { kind: "source"; source: AskSource };

/**
 * Cuts an answer into plain text and citations. The server has already rebuilt the `[S1]` markers so only real source numbers are left, but
 * a number that is not in `sources` is still kept as plain text here, so a citation can never point at something that was not sent.
 * The result is only ever drawn as React text and links the app builds itself: the answer is never put in the page as HTML.
 */
export function splitAnswer(answer: string, sources: AskSource[]): AnswerPart[] {
  const parts: AnswerPart[] = [];
  let last = 0;
  for (const match of answer.matchAll(/\[S(\d+)\]/g)) {
    const source = sources.find((s) => s.n === Number(match[1]));
    if (!source) continue;
    if (match.index > last) parts.push({ kind: "text", text: answer.slice(last, match.index) });
    parts.push({ kind: "source", source });
    last = match.index + match[0].length;
  }
  if (last < answer.length) parts.push({ kind: "text", text: answer.slice(last) });
  return parts;
}

/** "WEB-12" -> the project key and number the issue page's address needs. Null for anything else (the chip is then not a link). */
export function parseSourceKey(key: string): { projectKey: string; number: number } | null {
  const match = /^([A-Za-z0-9]+)-(\d+)$/.exec(key);
  return match ? { projectKey: match[1]!, number: Number(match[2]) } : null;
}

/** "7 of 10 questions left this hour". */
export function describeLimits(limits: AskLimits): string {
  const when = limits.window === "hour" ? "this hour" : limits.window === "day" ? "today" : "in this demo";
  return `${limits.remaining} of ${limits.limit} question${limits.limit === 1 ? "" : "s"} left ${when}`;
}

/** The chat as plain text for "Copy chat": each question and answer, with the issues an answer used. No ids, only what is on the screen. */
export function chatToText(messages: Array<{ kind: "question" | "answer" | "problem"; text: string; sources?: AskSource[] }>): string {
  return messages
    .map((m) => {
      if (m.kind === "question") return `You: ${m.text}`;
      const who = m.kind === "answer" ? "FlowDesc" : "FlowDesc (problem)";
      const sources = m.sources && m.sources.length > 0 ? `\nSources: ${m.sources.map((s) => `${s.key} ${s.title}`).join("; ")}` : "";
      return `${who}: ${m.text}${sources}`;
    })
    .join("\n\n");
}
