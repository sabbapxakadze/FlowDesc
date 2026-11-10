/**
 * Reading a question before searching (ADR 0077, decision 3): which issue keys it names, which of the four fixed question types it asks, and what text
 * is left to search for. Pure functions, no database and no model, so every pattern below is tested on its own.
 *
 * The patterns are deliberately few and plain. They decide only WHAT TO LOOK UP; the model still writes the answer from what is found. A question that
 * matches none of them still gets text search. A wrong match costs a few extra sources, never a wrong action: nothing here changes data.
 */

export type Intent = "overdue" | "dueToday" | "dueWeek" | "assignedToMe" | "inProgress" | "overview" | "workload" | "recent" | "urgent" | "unassigned";

export type ParsedQuestion = {
  /**
   * Issue keys named in the question, upper-cased, first five, in order ("WEB-12"). `loose` is true when the person did not type the plain dashed form
   * ("web12", "web 12", "WEB_12", "WEB#12"): such a key was only accepted because its project exists, so a loose key that names no issue is not worth a fact.
   */
  keys: { projectKey: string; number: number; loose: boolean }[];
  intents: Intent[];
  /** What is left to search as text once the matched question types are taken out. */
  text: string;
};

const MAX_KEYS = 5;
// A project key is a letter then letters or digits (at most 10, as in the projects table); the number is 1 to 9 digits (as the by-number address allows).
const KEY = /\b([A-Za-z][A-Za-z0-9]{0,9})-(\d{1,9})\b/g;
// The dashes a copied or auto-corrected key can carry instead of a plain hyphen: hyphen, non-breaking hyphen, figure dash, en dash, em dash, horizontal bar, minus.
const DASHES = /[‐-―−]/g;
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const PATTERNS: { intent: Intent; pattern: RegExp }[] = [
  { intent: "overdue", pattern: /\b(overdue|over due|past due|behind schedule)\b/gi },
  // "due today", "today's deadlines", "what is due by the end of today"
  { intent: "dueToday", pattern: /\b(due (by |on )?(the end of )?today|due today|today'?s? (deadlines?|due)|deadlines? today)\b/gi },
  { intent: "dueWeek", pattern: /\b(due (by |in |during |on )?(the end of )?this week|this week'?s? (deadlines?|due)|deadlines? this week|due (by |before )?(the )?end of (the )?week)\b/gi },
  { intent: "assignedToMe", pattern: /\b(assigned to me|(?:my|mine) (?:open )?(?:issues?|tasks?|work|tickets?)|on my plate|i am assigned|i'm assigned)\b/gi },
  // "working on" is left out on purpose: "who is working on login?" is a text question, not a request for everything in progress.
  { intent: "inProgress", pattern: /\b(in[- ]progress|currently in progress)\b/gi },
  // Who has how much open work. Deliberately NOT "who is working on <something>": that names a topic and stays a text question.
  {
    intent: "workload",
    pattern:
      /\b(workload|busiest|who (?:has|have) the most (?:open )?(?:work|issues?|tasks?|tickets?)|who (?:has|have) (?:got )?(?:the )?most (?:open )?(?:work|issues?|tasks?|tickets?)|(?:open )?(?:issues?|tasks?|work) (?:per|by) (?:person|member|assignee|people)|who is working on what)\b/gi,
  },
  { intent: "recent", pattern: /\b(recent(?:ly)? (?:changes?|changed|updated|activity|issues?)|what changed (?:lately|recently)|what'?s new|latest (?:changes?|updates?|issues?)|what happened (?:lately|recently)|updated (?:lately|recently))\b/gi },
  { intent: "urgent", pattern: /\b(urgent|high[- ]priority|top[- ]priority|highest priority)\b/gi },
  { intent: "unassigned", pattern: /\b(unassigned|not assigned|(?:no ?body|no ?one) (?:is )?assigned|without (?:an )?assignee)\b/gi },
  // Questions about the workspace itself ("what statuses do we have?", "how many issues are there?", "which projects?"): answered from counts, not from issue text.
  {
    intent: "overview",
    pattern:
      /\b(statuses|status (options|values|list)|what status(es)?|which status(es)?|workflow|how many (open |total )?(issues?|tasks?|tickets?)|overview|(?:what|which|list( of)?|how many) projects?|(?:what|which) priorit(?:y|ies)|priorit(?:y|ies) (levels|options))\b/gi,
  },
];

const GREETING_OR_HELP =
  /^(hi|hello|hey|hiya|yo|hola|sup|howdy|good (morning|afternoon|evening)|help|help me|what can you do|what do you do|what can i ask( you)?|how does this work|how do i use this|who are you|what are you)( there| flowdesc| everyone)?$/;
const THANKS = /^(thanks|thank you|thx|ty|ok|okay|cool|great|nice|got it)( a lot| so much)?$/;

/**
 * A message that is only a greeting, a thank-you or a request for help ("hi", "what can you do?", "thanks"). The WHOLE message has to be one, so
 * "help with the login bug" and "hello, what is overdue?" are still real questions. These get a fixed reply and cost nothing (no search, no model).
 */
export function smallTalk(question: string): "help" | "thanks" | null {
  const plain = cleanQuestion(question)
    .toLowerCase()
    .replace(/[!?.,:;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (GREETING_OR_HELP.test(plain)) return "help";
  if (THANKS.test(plain)) return "thanks";
  return null;
}

export const HELP_REPLY = [
  "Hi! I answer questions about your issues and comments. You can ask things like:",
  "- What is overdue?",
  "- What is in progress?",
  "- What is assigned to me?",
  "- What is urgent, or unassigned?",
  "- Who has the most open issues?",
  "- What changed recently?",
  "- What is due today, or this week?",
  "- What statuses and projects do we have?",
  "- What happened on WEB-12? (use an issue key)",
  "- Or use words from an issue, such as \"login\" or \"pricing\".",
].join("\n");

export const THANKS_REPLY = "You're welcome! Ask another question any time.";

/** Control characters out, runs of white space made one space, and the ends trimmed. */
export function cleanQuestion(question: string): string {
  // eslint-disable-next-line no-control-regex -- removing control characters from user input is the point
  return question.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * `knownProjectKeys` are the keys of the organization's real projects. With them, a key typed without the dash is understood too ("web12", "web 12",
 * "WEB_12", "WEB#12", "web - 12"): the letters must be one of those keys, so "iOS 17" or "Windows 11" is never read as an issue unless such a project exists.
 */
export function parseQuestion(question: string, knownProjectKeys: readonly string[] = []): ParsedQuestion {
  const clean = cleanQuestion(question).replace(DASHES, "-");

  const found: { index: number; projectKey: string; number: number; loose: boolean }[] = [];
  for (const match of clean.matchAll(KEY)) found.push({ index: match.index, projectKey: match[1]!.toUpperCase(), number: Number(match[2]), loose: false });

  // Longest keys first, so "WEB2" is tried before "WEB".
  const known = [...new Set(knownProjectKeys.map((k) => k.toUpperCase()))].sort((a, b) => b.length - a.length).map(escapeRegExp);
  const LOOSE = known.length > 0 ? new RegExp(`\\b(${known.join("|")})\\s*[-_#]?\\s*(\\d{1,9})\\b`, "gi") : null;
  if (LOOSE) {
    for (const match of clean.matchAll(LOOSE)) found.push({ index: match.index, projectKey: match[1]!.toUpperCase(), number: Number(match[2]), loose: true });
  }

  const keys: ParsedQuestion["keys"] = [];
  for (const item of found.sort((a, b) => a.index - b.index)) {
    if (item.number <= 0) continue;
    const existing = keys.find((k) => k.projectKey === item.projectKey && k.number === item.number);
    if (existing) {
      if (!item.loose) existing.loose = false; // typed in full somewhere in the question: it counts as a real key
    } else if (keys.length < MAX_KEYS) {
      keys.push({ projectKey: item.projectKey, number: item.number, loose: item.loose });
    }
  }

  const intents: Intent[] = [];
  let text = clean.replace(KEY, " ");
  if (LOOSE) text = text.replace(LOOSE, " ");
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
