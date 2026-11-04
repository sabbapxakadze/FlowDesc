import { z } from "zod";

/**
 * "Ask FlowDesc" (ADR 0077): a person asks a question about their organization's issues and gets a short answer with the issues it came from.
 * The limits are shared so the panel and the server cannot disagree about what is allowed.
 */
export const ASK_MAX_QUESTION = 500;

export const askRequestSchema = z.object({
  question: z.string().trim().min(1, "Type a question.").max(ASK_MAX_QUESTION, `Use ${ASK_MAX_QUESTION} characters or fewer.`),
});
export type AskRequest = z.infer<typeof askRequestSchema>;

/** An issue the answer was built from. `n` is the number in the answer's `[S1]` markers. Only what a citation chip needs: never the issue's text. */
export const askSourceSchema = z.object({
  n: z.number().int().min(1),
  key: z.string(),
  title: z.string(),
  status: z.enum(["todo", "in_progress", "done"]),
});
export type AskSource = z.infer<typeof askSourceSchema>;

/**
 * What is left of the tightest limit that applies to this person: this hour, today, or (in a demo copy) the demo's own few questions.
 * `limit` is that window's total, so the panel can say "7 of 10 questions left this hour".
 */
export const askLimitsSchema = z.object({
  remaining: z.number().int().min(0),
  limit: z.number().int().min(1),
  window: z.enum(["hour", "day", "demo"]),
});
export type AskLimits = z.infer<typeof askLimitsSchema>;

export const askResponseSchema = z.object({
  data: z.object({
    /** Plain text. `[S1]`, `[S2]` mark which source supports a sentence. Never HTML, Markdown or links: the panel shows it as text. */
    answer: z.string(),
    sources: z.array(askSourceSchema),
    limits: askLimitsSchema,
  }),
});
export type AskResponse = z.infer<typeof askResponseSchema>;

/** Public, like the demo's info: only whether Ask is switched on, so the panel can hide itself when it is not. */
export const askInfoResponseSchema = z.object({
  data: z.object({ enabled: z.boolean(), maxQuestionLength: z.number().int() }),
});
export type AskInfoResponse = z.infer<typeof askInfoResponseSchema>;
