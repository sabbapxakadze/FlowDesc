import { and, count, eq, gt, inArray, isNotNull, lt } from "drizzle-orm";
import { db } from "../../db/client.js";
import { demoStarts, issues, organizationMembers, organizations, users } from "../../db/schema/index.js";

/**
 * Deletes every demo organization whose time is up, and the people made for it (ADR 0044). The organization goes first: deleting it
 * removes its projects, issues, events, comments, notifications, labels, members, invitations and audit rows, and only then can its
 * users go (their rows are referenced by those). Returns how many demos were removed.
 */
export async function deleteExpiredDemos(now: Date): Promise<number> {
  const expired = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(isNotNull(organizations.demoExpiresAt), lt(organizations.demoExpiresAt, now)));
  if (expired.length === 0) return 0;

  const organizationIds = expired.map((o) => o.id);
  const members = await db
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(inArray(organizationMembers.organizationId, organizationIds));

  await db.transaction(async (tx) => {
    await tx.delete(organizations).where(inArray(organizations.id, organizationIds));
    if (members.length > 0) {
      await tx.delete(users).where(inArray(users.id, members.map((m) => m.userId)));
    }
  });
  return organizationIds.length;
}

/** How many demo copies are alive right now (made and not yet expired). */
export async function countLiveDemos(now: Date): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(organizations)
    .where(and(isNotNull(organizations.demoExpiresAt), gt(organizations.demoExpiresAt, now)));
  return row?.total ?? 0;
}

/** One row per click on "Try the demo" (ADR 0076): nothing personal, and it outlives the copy. */
export async function recordStart(outcome: "started" | "busy"): Promise<void> {
  await db.insert(demoStarts).values({ outcome });
}

export async function isDemoOrganization(organizationId: string): Promise<boolean> {
  const [row] = await db
    .select({ demoExpiresAt: organizations.demoExpiresAt })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);
  return row?.demoExpiresAt != null;
}

/** Is this person a member of a demo copy? (Real people are never in one, and a copy's people are never in a real organization.) */
export async function isDemoUser(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: organizations.id })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(and(eq(organizationMembers.userId, userId), isNotNull(organizations.demoExpiresAt)))
    .limit(1);
  return row !== undefined;
}

export async function countIssuesInOrganization(organizationId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(issues)
    .where(eq(issues.organizationId, organizationId));
  return row?.total ?? 0;
}
