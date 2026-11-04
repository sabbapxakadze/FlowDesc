import * as repository from "./ask.repository.js";
import { clip, cleanQuestion, parseQuestion, plainText, weekOf, type Intent } from "./ask.question.js";

/**
 * Retrieval, phase A (ADR 0077, decision 3): from a question to the few issues, and the few facts, a model may read to answer it. Everything here is read-only
 * and organization-scoped through the repository. No model is involved: this decides WHAT IS READ, and the endpoint (a later slice) decides what is said.
 *
 * Order of preference when there is room for only some: issues the question names by key, then the lists a fixed question type asks for ("what is overdue?"),
 * then the best text matches. The whole result is held to a size budget so a prompt (and the Neurons it costs) stays small.
 */

export const LIMITS = {
  /** Most issues in one result. */
  maxSources: 8,
  /** Most issues taken from the keys a question names. */
  keyed: 3,
  /** Most issues taken from each fixed question type's list. */
  perIntent: 5,
  /** Characters of an issue's description kept. */
  description: 600,
  commentsPerSource: 3,
  /** Characters of each comment kept. */
  comment: 300,
  /** All the text of all the sources together. Checked as a cost choice: the model accepts far more (ADR 0077, results). */
  sourceCharacters: 12_000,
} as const;

export type SourceComment = { author: string; date: string; text: string };

export type Source = {
  id: string;
  /** "WEB-12". */
  key: string;
  title: string;
  project: string;
  status: "todo" | "in_progress" | "done";
  priority: "none" | "low" | "medium" | "high" | "urgent";
  assignee: string | null;
  /** A calendar day, "YYYY-MM-DD". */
  dueDate: string | null;
  description: string;
  comments: SourceComment[];
  /** Why it is here, in words the model can read ("overdue", "named in the question (WEB-12)", "matches the question"). */
  why: string;
};

export type Retrieved = {
  sources: Source[];
  /** Plain statements that are true of the whole workspace and that the sources alone could not show: totals, and keys that name nothing. */
  facts: string[];
  /** The text of the sources and facts together, for the budget and the usage record. */
  characters: number;
};

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function listFact(label: string, total: number, shown: number): string {
  if (total === 0) return `${label}: none.`;
  return `${label}: ${total} in total${total > shown ? `; the ${shown} listed are the first ones` : ""}.`;
}

export async function retrieveSources(input: { organizationId: string; userId: string; question: string; today: string }): Promise<Retrieved> {
  if (!DAY.test(input.today)) throw new Error("retrieveSources needs today as YYYY-MM-DD");
  const { organizationId, userId, today } = input;
  const parsed = parseQuestion(cleanQuestion(input.question));

  const candidates: { id: string; why: string }[] = [];
  const facts: string[] = [];
  const add = (id: string, why: string) => {
    if (candidates.length < LIMITS.maxSources && !candidates.some((c) => c.id === id)) candidates.push({ id, why });
  };

  // 1. Issues named by key. A key that names nothing is a fact the model needs, or it would be tempted to describe an issue that does not exist.
  const keyed = await repository.findByKeys(organizationId, parsed.keys);
  for (const k of parsed.keys) {
    if (!keyed.some((f) => f.key === `${k.projectKey}-${k.number}`)) facts.push(`No issue with the key ${k.projectKey}-${k.number} exists in this workspace.`);
  }
  for (const found of keyed.slice(0, LIMITS.keyed)) add(found.id, `named in the question (${found.key})`);

  // 2. The fixed question types, each answered with the app's own definitions.
  const week = weekOf(today);
  const lists: Record<Intent, { label: string; run: () => Promise<repository.IdList>; why: string }> = {
    overdue: { label: `Overdue issues (due before ${today}, not done)`, run: () => repository.listOverdue(organizationId, today, LIMITS.perIntent), why: "overdue" },
    dueToday: { label: `Issues due today (${today}), not done`, run: () => repository.listDueBetween(organizationId, today, today, LIMITS.perIntent), why: "due today" },
    dueWeek: {
      label: `Issues due this week (${week.from} to ${week.to}), not done`,
      run: () => repository.listDueBetween(organizationId, week.from, week.to, LIMITS.perIntent),
      why: "due this week",
    },
    assignedToMe: {
      label: "Open issues assigned to the person asking",
      run: () => repository.listAssignedTo(organizationId, userId, LIMITS.perIntent),
      why: "assigned to the person asking",
    },
    inProgress: { label: "Issues in progress", run: () => repository.listInProgress(organizationId, LIMITS.perIntent), why: "in progress" },
  };
  const results = await Promise.all(parsed.intents.map((intent) => lists[intent].run()));
  parsed.intents.forEach((intent, i) => {
    const list = results[i]!;
    facts.push(listFact(lists[intent].label, list.total, list.ids.length));
    for (const id of list.ids) add(id, lists[intent].why);
  });

  // 3. Text matches fill what is left. Skipped when nothing searchable remains once keys and question types are taken out.
  if (/[\p{L}\p{N}]/u.test(parsed.text)) {
    for (const id of await repository.searchByText(organizationId, parsed.text, LIMITS.maxSources)) add(id, "matches the question");
  }

  // 4. Load them, in the order they were chosen. An issue deleted in between simply has no card.
  const ids = candidates.map((c) => c.id);
  const [cards, comments] = await Promise.all([
    repository.loadIssueCards(organizationId, ids),
    repository.loadComments(organizationId, ids, parsed.text, LIMITS.commentsPerSource),
  ]);
  const cardById = new Map(cards.map((c) => [c.id, c]));

  const sources: Source[] = [];
  let characters = facts.reduce((sum, f) => sum + f.length, 0);
  for (const { id, why } of candidates) {
    const card = cardById.get(id);
    if (!card) continue;
    const source: Source = {
      id,
      key: `${card.projectKey}-${card.number}`,
      title: card.title,
      project: card.projectName,
      status: card.status,
      priority: card.priority,
      assignee: card.assigneeName,
      dueDate: card.dueDate,
      description: clip(plainText(card.description ?? ""), LIMITS.description),
      comments: comments
        .filter((c) => c.issueId === id)
        .map((c) => ({ author: c.authorName, date: c.createdAt.toISOString().slice(0, 10), text: clip(plainText(c.body), LIMITS.comment) })),
      why,
    };
    const size = source.title.length + source.description.length + source.comments.reduce((sum, c) => sum + c.text.length, 0) + 120;
    if (sources.length > 0 && characters + size > LIMITS.sourceCharacters) break; // always keep the first, drop the rest once the budget is spent
    characters += size;
    sources.push(source);
  }
  return { sources, facts, characters };
}
