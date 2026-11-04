import type { AskLimits, AskSource } from "@flowdesc/contracts";
import { env } from "../../config/env.js";
import { getAiProvider } from "../../lib/ai-provider.js";
import { AiProviderError } from "../../lib/ai.js";
import { logger } from "../../lib/logger.js";
import { AppError } from "../../shared/errors.js";
import * as authRepository from "../auth/auth.repository.js";
import * as demoRepository from "../demo/demo.repository.js";
import { cleanAnswer } from "./ask.answer.js";
import { buildMessages } from "./ask.prompt.js";
import { cleanQuestion } from "./ask.question.js";
import { retrieveSources } from "./ask.retrieval.js";
import { secondsUntilNextUtcDay, startOfUtcDay, todayIn } from "./ask.time.js";
import * as usage from "./ask.usage.repository.js";

/**
 * Ask FlowDesc (ADR 0077): from a question to an answer with its sources. In order: is Ask on, is the question usable, is this person already running a
 * question, are the limits respected (the person's, the demo's, the whole site's), then retrieve, then (only if there is something to read) ask the model,
 * then make its words safe. Nothing here stores or logs a question, a source or an answer: the usage table holds counts, and the logs hold ids and outcomes.
 */

/** The answer is capped at this many tokens, a cost choice (ADR 0077, decision 6). */
export const MAX_ANSWER_TOKENS = 400;
const RETENTION_DAYS = 30;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** People whose question is running now. In memory, like the other limiters: one server, and a restart only frees the slot. */
const inFlight = new Set<string>();

export type AskResult = { answer: string; sources: AskSource[]; limits: AskLimits };

async function refuse(userId: string, error: AppError): Promise<never> {
  await usage.insertLimited(userId);
  throw error;
}

const minutes = (ms: number) => Math.max(1, Math.ceil(ms / 60_000));

/** The person's own limits (this hour and today, or a demo copy's few in all), then the whole site's. Refusals are recorded and never counted. */
async function assertWithinLimits(userId: string, isDemo: boolean, now: Date): Promise<void> {
  if (isDemo) {
    const used = await usage.countForUser(userId, null);
    if (used.count >= env.ASK_LIMIT_PER_DEMO) {
      await refuse(
        userId,
        new AppError("ask_limit_demo", 429, `The demo allows ${env.ASK_LIMIT_PER_DEMO} questions. Create an account to ask more.`, undefined, { window: "demo" }),
      );
    }
  } else {
    const hour = await usage.countForUser(userId, new Date(now.getTime() - HOUR));
    if (hour.count >= env.ASK_LIMIT_PER_HOUR) {
      const wait = hour.oldest ? hour.oldest.getTime() + HOUR - now.getTime() : HOUR;
      await refuse(
        userId,
        new AppError("ask_limit_person", 429, `You have used your ${env.ASK_LIMIT_PER_HOUR} questions for this hour. Try again in ${minutes(wait)} minute${minutes(wait) === 1 ? "" : "s"}.`, undefined, {
          window: "hour",
          retryAfterSeconds: Math.ceil(wait / 1000),
        }),
      );
    }
    const day = await usage.countForUser(userId, new Date(now.getTime() - DAY));
    if (day.count >= env.ASK_LIMIT_PER_DAY) {
      const wait = day.oldest ? day.oldest.getTime() + DAY - now.getTime() : DAY;
      const hours = Math.max(1, Math.ceil(wait / HOUR));
      await refuse(
        userId,
        new AppError("ask_limit_person", 429, `You have used your ${env.ASK_LIMIT_PER_DAY} questions for today. Try again in about ${hours} hour${hours === 1 ? "" : "s"}.`, undefined, {
          window: "day",
          retryAfterSeconds: Math.ceil(wait / 1000),
        }),
      );
    }
  }

  const site = await usage.siteSince(startOfUtcDay(now));
  if (site.questions >= env.ASK_DAILY_QUESTIONS || site.neurons >= env.ASK_DAILY_NEURONS) {
    await refuse(
      userId,
      new AppError("ask_resting", 503, "Ask is resting until tomorrow (00:00 UTC).", undefined, { retryAfterSeconds: secondsUntilNextUtcDay(now) }),
    );
  }
}

/** What is left of the tightest limit that applies, counted after this question. */
async function limitsFor(userId: string, isDemo: boolean, now: Date): Promise<AskLimits> {
  if (isDemo) {
    const used = await usage.countForUser(userId, null);
    return { remaining: Math.max(0, env.ASK_LIMIT_PER_DEMO - used.count), limit: env.ASK_LIMIT_PER_DEMO, window: "demo" };
  }
  const [hour, day] = await Promise.all([usage.countForUser(userId, new Date(now.getTime() - HOUR)), usage.countForUser(userId, new Date(now.getTime() - DAY))]);
  const leftHour = Math.max(0, env.ASK_LIMIT_PER_HOUR - hour.count);
  const leftDay = Math.max(0, env.ASK_LIMIT_PER_DAY - day.count);
  return leftHour <= leftDay
    ? { remaining: leftHour, limit: env.ASK_LIMIT_PER_HOUR, window: "hour" }
    : { remaining: leftDay, limit: env.ASK_LIMIT_PER_DAY, window: "day" };
}

/** What the person is told when the provider fails. Only the kind is looked at; the provider's own words never get this far (lib/ai.ts). */
function messageFor(error: unknown): AppError {
  if (!(error instanceof AiProviderError)) return error instanceof AppError ? error : new AppError("ask_failed", 502, "Ask could not answer right now. Please try again in a moment.");
  switch (error.kind) {
    case "rate_limited":
      return new AppError("ask_resting", 503, "Ask is resting right now. Please try again later.");
    case "timeout":
      return new AppError("ask_failed", 502, "Ask took too long to answer. Please try again.");
    case "aborted":
      return new AppError("ask_cancelled", 400, "The question was cancelled.");
    case "rejected":
      // The credentials are wrong or lack a permission: the owner's problem, not the person's, and a different message would only invite guessing.
      return new AppError("ask_unavailable", 503, "Ask is not available right now.");
    default:
      return new AppError("ask_failed", 502, "Ask could not answer right now. Please try again in a moment.");
  }
}

export async function ask(input: { organizationId: string; userId: string; question: string; signal?: AbortSignal; now?: Date }): Promise<AskResult> {
  const provider = getAiProvider();
  if (!provider) throw new AppError("ask_unavailable", 503, "Ask is not available right now.");

  const question = cleanQuestion(input.question);
  if (question === "") throw new AppError("validation_error", 400, "Invalid question", { question: ["Type a question."] });

  const { organizationId, userId } = input;
  const now = input.now ?? new Date();

  if (inFlight.has(userId)) throw new AppError("ask_busy", 429, "Wait for your previous question to finish.");
  inFlight.add(userId);
  try {
    const isDemo = await demoRepository.isDemoUser(userId);
    await assertWithinLimits(userId, isDemo, now);

    const requestId = await usage.insertStarted(userId);
    // Housekeeping on the way in, so no scheduler is needed; a failure to tidy never stops a question.
    void usage.deleteOlderThan(new Date(now.getTime() - RETENTION_DAYS * DAY)).catch((err: unknown) => logger.warn({ err }, "could not tidy old Ask usage rows"));

    let finished = false;
    try {
      const user = await authRepository.findUserById(userId);
      const retrieved = await retrieveSources({ organizationId, userId, question, today: todayIn(user?.timezone ?? null, now) });
      const sources: AskSource[] = retrieved.sources.map((s, i) => ({ n: i + 1, key: s.key, title: s.title, status: s.status }));

      // Nothing to read: no model call, nothing spent. The facts ("Nothing is overdue.") are an answer on their own; with no facts either, say so.
      if (retrieved.sources.length === 0) {
        const answer = retrieved.facts.length > 0 ? retrieved.facts.join("\n") : "I could not find anything about that in your workspace.";
        await usage.finish(requestId, "no_sources", 0, null);
        finished = true;
        logger.info({ userId, outcome: "no_sources" }, "ask answered without the model");
        return { answer, sources: [], limits: await limitsFor(userId, isDemo, now) };
      }

      const { messages } = buildMessages({ question, retrieved });
      let response;
      try {
        response = await provider.generate({ messages, maxTokens: MAX_ANSWER_TOKENS, signal: input.signal });
      } catch (err) {
        await usage.finish(requestId, "provider_error", sources.length, null);
        finished = true;
        // Only the kind and the status: never the provider's words, a header or the prompt.
        if (err instanceof AiProviderError) logger.warn({ userId, kind: err.kind, status: err.status }, "ask provider failed");
        throw messageFor(err);
      }

      const cleaned = cleanAnswer(response.text, sources.length);
      if (cleaned.text === "") {
        await usage.finish(requestId, "provider_error", sources.length, response.usage?.neurons ?? null);
        finished = true;
        throw new AppError("ask_failed", 502, "Ask could not answer right now. Please try again in a moment.");
      }
      await usage.finish(requestId, "answered", sources.length, response.usage?.neurons ?? null);
      finished = true;
      logger.info({ userId, outcome: "answered", sources: sources.length, neurons: response.usage?.neurons }, "ask answered");
      return { answer: cleaned.text, sources, limits: await limitsFor(userId, isDemo, now) };
    } catch (err) {
      // An unexpected failure (retrieval, the database) must not leave the row "started" forever: it would count as running and cost-bearing.
      if (!finished) await usage.finish(requestId, "provider_error", 0, null).catch(() => undefined);
      throw err;
    }
  } finally {
    inFlight.delete(userId);
  }
}
