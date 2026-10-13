import { and, count, desc, eq, gt, isNull, lt, or } from "drizzle-orm";
import { db } from "../../db/client.js";
import { apiTokens } from "../../db/schema/index.js";

const summaryColumns = {
  id: apiTokens.id,
  name: apiTokens.name,
  scope: apiTokens.scope,
  createdAt: apiTokens.createdAt,
  expiresAt: apiTokens.expiresAt,
  lastUsedAt: apiTokens.lastUsedAt,
  revokedAt: apiTokens.revokedAt,
};

export async function insert(input: {
  userId: string;
  name: string;
  tokenHash: string;
  scope: "read" | "read_write";
  expiresAt: Date;
}) {
  const [row] = await db.insert(apiTokens).values(input).returning(summaryColumns);
  return row!;
}

/** A person's tokens, newest first. Never selects the hash. */
export async function listForUser(userId: string) {
  return db.select(summaryColumns).from(apiTokens).where(eq(apiTokens.userId, userId)).orderBy(desc(apiTokens.createdAt));
}

/** Tokens that still work: not revoked and not past their date. */
export async function countActiveForUser(userId: string, now: Date): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(apiTokens)
    .where(and(eq(apiTokens.userId, userId), isNull(apiTokens.revokedAt), gt(apiTokens.expiresAt, now)));
  return row?.n ?? 0;
}

/** Sets revokedAt once (a second revoke keeps the first time). Returns undefined when the token is not this person's. */
export async function revoke(userId: string, tokenId: string, now: Date) {
  const [owned] = await db
    .select({ id: apiTokens.id })
    .from(apiTokens)
    .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId)))
    .limit(1);
  if (!owned) return undefined;
  await db.update(apiTokens).set({ revokedAt: now }).where(and(eq(apiTokens.id, tokenId), isNull(apiTokens.revokedAt)));
  return owned;
}

/** The lookup behind every request that carries a token: only a token that is not revoked and not expired is found. */
export async function findUsableByHash(tokenHash: string, now: Date) {
  const [row] = await db
    .select({ id: apiTokens.id, userId: apiTokens.userId, scope: apiTokens.scope })
    .from(apiTokens)
    .where(and(eq(apiTokens.tokenHash, tokenHash), isNull(apiTokens.revokedAt), gt(apiTokens.expiresAt, now)))
    .limit(1);
  return row;
}

/** Records use, but at most once a minute per token, so reading does not turn into a write on every request. */
export async function touch(tokenId: string, now: Date) {
  const aMinuteAgo = new Date(now.getTime() - 60_000);
  await db
    .update(apiTokens)
    .set({ lastUsedAt: now })
    .where(and(eq(apiTokens.id, tokenId), or(isNull(apiTokens.lastUsedAt), lt(apiTokens.lastUsedAt, aMinuteAgo))));
}
