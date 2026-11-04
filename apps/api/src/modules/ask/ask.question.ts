/**
 * Reading a question before searching (ADR 0077, decision 3): which issue keys it names, which of the four fixed question types it asks, and what text
 * is left to search for. Pure functions, no database and no model, so every pattern below is tested on its own.
 *
 * The patterns are deliberately few and plain. They decide only WHAT TO LOOK UP; the model still writes the answer from what is found. A question that
 * matches none of them still gets text search. A wrong match costs a few extra sources, never a wrong action: nothing here changes data.
 */

export type Intent = "overdue" | "dueToday" | "dueWeek" | "assignedToMe" | "inProgress";

export type ParsedQuestion = {
  /** Issue keys named in the question, upper-cased, first five, in order ("WEB-12"). */
  keys: { projectKey: string; number: number }[];
  intents: Intent[];
  /** What is left to search as text once the matched question types are taken out. */
  text: string;
};

const MAX_KEYS = 5;
// A project key is a letter then letters or digits (at most 10, as in the projects table); the number is 1 to 9 digits (as the by-number address allows).
const KEY = /\b([A-Za-z][A-Za-z0-9]{0,9})-(\d{1,9})\b/g;

const PATTERNS: { intent: Intent; pattern: RegExp }[] = [
  { intent: "overdue", pattern: /\b(overdue|over due|past due|behind schedule)\b/gi },
  // "due today", "today's deadlines", "what is due by the end of today"
  { intent: "dueToday", pattern: /\b(due (by |on )?(the end of )?today|due today|today'?s? (deadlines?|due)|deadlines? today)\b/gi },
  { intent: "dueWeek", pattern: /\b(due (by |in |during |on )?(the end of )?this week|this week'?s? (deadlines?|due)|deadlines? this week|due (by |before )?(the )?end of (the )?week)\b/gi },
  { intent: "assignedToMe", pattern: /\b(assigned to me|(?:my|mine) (?:open )?(?:issues?|tasks?|work|tickets?)|on my plate|i am assigned|i'm assigned)\b/gi },
  // "working on" is left out on purpose: "who is working on login?" is a text question, not a request for everything in progress.
  { intent: "inProgress", pattern: /\b(in[- ]progress|currently in progress)\b/gi },
];

/** Control characters out, runs of white space made one space, and the ends trimmed. */
export function cleanQuestion(question: string): string {
  // eslint-disable-next-line no-control-regex -- removing control characters from user input is the point
  return question.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

export function parseQuestion(question: string): ParsedQuestion {
  const clean = cleanQuestion(question);

  const keys: ParsedQuestion["keys"] = [];
  for (const match of clean.matchAll(KEY)) {
    const key = { projectKey: match[1]!.toUpperCase(), number: Number(match[2]) };
    if (key.number > 0 && !keys.some((k) => k.projectKey === key.projectKey && k.number === key.number)) keys.push(key);
    if (keys.length === MAX_KEYS) break;
  }

  const intents: Intent[] = [];
  let text = clean.replace(KEY, " ");
  for (const { intent, pattern } of PATTERNS) {
    // A fresh test on a copy: the patterns are global, so `lastIndex` must not leak between questions.
    if (new RegExp(pattern.source, pattern.flags.replace("g", "")).test(clean)) {
      intents.push(intent);
      text = text.replace(pattern, " ");
    }
  }
  return { keys, intents, text: text.replace(/\s+/g, " ").trim() };
}

/** Monday and Sunday of the week containing `today` ("YYYY-MM-DD"), as calendar days, the same week the My work page and the MCP server use. */
export function weekOf(today: string): { from: string; to: string } {
  const day = new Date(`${today}T00:00:00Z`);
  const sinceMonday = (day.getUTCDay() + 6) % 7;
  const add = (n: number) => new Date(day.getTime() + n * 86_400_000).toISOString().slice(0, 10);
  return { from: add(-sinceMonday), to: add(6 - sinceMonday) };
}

/** Markdown out of a description or a comment, for reading by a model: picture tokens dropped, mention tokens reduced to "@Name" (ADR 0063). */
export function plainText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\(attachment:[0-9a-fA-F-]{36}\)/g, " ")
    .replace(/@\[([^\]]*)\]\(user:[0-9a-fA-F-]{36}\)/g, "@$1")
    .replace(/\s+/g, " ")
    .trim();
}

/** At most `max` characters, cut at the end with an ellipsis (counted in the length). */
export function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}
