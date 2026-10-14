import { pgTable, uuid, varchar, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { apiTokens } from "./api-tokens.js";
import { issues } from "./issues.js";
import { users } from "./users.js";

/**
 * Append-only — no updatedAt, rows are never modified after insert. Every
 * state-changing issue operation writes one of these in the same
 * transaction as the mutation itself. See ADR 0005.
 */
export const issueEvents = pgTable(
  "issue_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: varchar("type", { length: 50 }).notNull(),
    payload: jsonb("payload").notNull().default({}),
    // Set when the change was made through a personal access token (ADR 0074) and not at the keyboard. The row says so in the same
    // transaction as the change; the read model only ever shows "via token", never which token.
    viaApiTokenId: uuid("via_api_token_id").references(() => apiTokens.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The timeline read pattern (slice 4) is always "this issue's events,
    // in order" — ADR 0005 calls this index out explicitly.
    index("issue_events_issue_id_created_at_idx").on(table.issueId, table.createdAt),
  ],
);
