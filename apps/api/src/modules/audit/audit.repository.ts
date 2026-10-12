import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { auditEvents, users } from "../../db/schema/index.js";
import type { AuditAction, AuditTargetType } from "@flowdesc/contracts";

/** The exact type db.transaction()'s callback receives (same extraction as issues.repository.ts). */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Appends one audit row INSIDE the caller's transaction: if this insert fails, the action it
 * records rolls back with it, and if the action fails, no row is left behind (ADR 0027). The
 * actor's name is looked up here and stored as a snapshot, so callers only pass the id.
 *
 * `targetLabel` is the thing's name, title or email AT THIS MOMENT (it may be deleted by the
 * time anyone reads the log); `details` carries before/after values shaped per action.
 */
export async function record(
  tx: Tx,
  input: {
    organizationId: string;
    actorId: string;
    action: AuditAction;
    targetType: AuditTargetType;
    targetId?: string | null;
    targetLabel: string;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  const [actor] = await tx.select({ name: users.name }).from(users).where(eq(users.id, input.actorId));
  await tx.insert(auditEvents).values({
    organizationId: input.organizationId,
    actorId: input.actorId,
    actorName: actor?.name ?? "Unknown user",
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId ?? null,
    targetLabel: input.targetLabel.slice(0, 500),
    details: input.details ?? {},
  });
}

type Row = typeof auditEvents.$inferSelect;

function encodeCursor(row: Pick<Row, "createdAt" | "id">): string {
  return Buffer.from(JSON.stringify({ createdAt: row.createdAt.toISOString(), id: row.id })).toString("base64url");
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    const { createdAt, id } = parsed as { createdAt?: unknown; id?: unknown };
    if (typeof createdAt !== "string" || typeof id !== "string") return null;
    const date = new Date(createdAt);
    return Number.isNaN(date.getTime()) ? null : { createdAt: date, id };
  } catch {
    return null;
  }
}

/**
 * The newest events for a CSV export, with the same filters and the same organization scoping as `list`. Asks for one
 * row more than `limit` so the caller can tell "exactly limit rows" from "more than limit rows" (`truncated`).
 */
export async function listForExport(
  organizationId: string,
  options: { actor?: string; kind?: AuditTargetType },
  limit: number,
): Promise<{ items: Row[]; truncated: boolean }> {
  const conditions = [eq(auditEvents.organizationId, organizationId)];
  if (options.actor) conditions.push(eq(auditEvents.actorId, options.actor));
  if (options.kind) conditions.push(eq(auditEvents.targetType, options.kind));
  const rows = await db
    .select()
    .from(auditEvents)
    .where(and(...conditions))
    .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
    .limit(limit + 1);
  return { items: rows.slice(0, limit), truncated: rows.length > limit };
}

/**
 * One organization's events, newest first, keyset-paged on (created_at, id) like the issue list,
 * served by audit_events_organization_id_created_at_id_idx. Always scoped by organizationId in
 * the query itself.
 */
export async function list(
  organizationId: string,
  options: { limit: number; cursor?: string; actor?: string; kind?: AuditTargetType },
): Promise<{ status: "ok"; items: Row[]; nextCursor: string | null } | { status: "invalid_cursor" }> {
  const conditions = [eq(auditEvents.organizationId, organizationId)];
  if (options.actor) conditions.push(eq(auditEvents.actorId, options.actor));
  if (options.kind) conditions.push(eq(auditEvents.targetType, options.kind));
  if (options.cursor) {
    const decoded = decodeCursor(options.cursor);
    if (!decoded) return { status: "invalid_cursor" };
    conditions.push(sql`(${auditEvents.createdAt}, ${auditEvents.id}) < (${decoded.createdAt.toISOString()}, ${decoded.id})`);
  }

  const rows = await db
    .select()
    .from(auditEvents)
    .where(and(...conditions))
    .orderBy(desc(auditEvents.createdAt), desc(auditEvents.id))
    .limit(options.limit + 1);

  const hasMore = rows.length > options.limit;
  const items = hasMore ? rows.slice(0, options.limit) : rows;
  const last = items[items.length - 1];
  return { status: "ok", items, nextCursor: hasMore && last ? encodeCursor(last) : null };
}
