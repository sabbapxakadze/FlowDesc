import { and, count, eq, gte, inArray, lt, min, ne, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { aiRequests, type AiOutcome } from "../../db/schema/index.js";

/**
 * The usage table behind Ask FlowDesc's limits (ADR 0077, decision 7). Rows hold no text of any question or answer, only who, how it ended, how many
 * sources and the Neurons used. The user id is a plain id with no foreign key, so a row outlives a demo copy.
 */

/** A question was accepted: counted from this moment, so a call that then fails still counts and retries cannot hammer the provider. */
export async function insertStarted(userId: string): Promise<string> {
  const [row] = await db.insert(aiRequests).values({ userId, outcome: "started" }).returning({ id: aiRequests.id });
  return row!.id;
}

/** A question was refused by a limit. Kept so the owner can see it; never counted toward a limit (or a refusal would keep itself going). */
export async function insertLimited(userId: string): Promise<void> {
  await db.insert(aiRequests).values({ userId, outcome: "limited" });
}

export async function finish(id: string, outcome: Exclude<AiOutcome, "started" | "limited">, sourcesCount: number, neurons: number | null): Promise<void> {
  await db.update(aiRequests).set({ outcome, sourcesCount, neurons }).where(eq(aiRequests.id, id));
}

/** How many questions this person has had accepted since `since` (all time when null), and when the oldest of them was asked. Refusals are not counted. */
export async function countForUser(userId: string, since: Date | null): Promise<{ count: number; oldest: Date | null }> {
  const [row] = await db
    .select({ count: count(), oldest: min(aiRequests.createdAt) })
    .from(aiRequests)
    .where(and(eq(aiRequests.userId, userId), ne(aiRequests.outcome, "limited"), since ? gte(aiRequests.createdAt, since) : undefined));
  return { count: row?.count ?? 0, oldest: row?.oldest ?? null };
}

/**
 * Everyone's questions since `since` that used, or may be using, the provider: `started` (still running), `answered` and `provider_error` (a failed call
 * may still have cost Neurons). `no_sources` made no call, and `limited` was refused, so neither spends the allowance.
 */
export async function siteSince(since: Date): Promise<{ questions: number; neurons: number }> {
  const [row] = await db
    .select({ questions: count(), neurons: sql<number>`coalesce(sum(${aiRequests.neurons}), 0)`.mapWith(Number) })
    .from(aiRequests)
    .where(and(gte(aiRequests.createdAt, since), inArray(aiRequests.outcome, ["started", "answered", "provider_error"])));
  return { questions: row?.questions ?? 0, neurons: row?.neurons ?? 0 };
}

/** Keeps the table small: rows older than the cutoff go. Called as questions come in, so no scheduler is needed. */
export async function deleteOlderThan(cutoff: Date): Promise<void> {
  await db.delete(aiRequests).where(lt(aiRequests.createdAt, cutoff));
}
