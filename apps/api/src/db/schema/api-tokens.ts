import { pgTable, pgEnum, uuid, varchar, timestamp, uniqueIndex, index } from "drizzle-orm/pg-core";
import { users } from "./users.js";

/**
 * What a personal access token may do (ADR 0070). `read_write` exists in the schema now so adding write tools later is not a
 * migration, but nothing creates one yet: the API only accepts "read" until the write slice.
 */
export const apiTokenScope = pgEnum("api_token_scope", ["read", "read_write"]);

/**
 * A personal access token: a long-lived, revocable credential a person gives to an automated client (an MCP server for an AI app,
 * ADR 0070). Same storage idea as sessions.refreshTokenHash: the raw token is shown once when it is made and only its sha256 hash
 * is kept (see modules/auth/tokens.ts), so a database leak does not leak working tokens.
 *
 * It belongs to a person, not an organization: it can do what its owner can do, no more (the usual membership and role checks run
 * after it), and it goes away with the user.
 */
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // A label the person chose ("Claude on my laptop"), so they can tell tokens apart in the list.
    name: varchar("name", { length: 80 }).notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    scope: apiTokenScope("scope").notNull().default("read"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Looked up on every request that carries a token.
    uniqueIndex("api_tokens_token_hash_unique").on(table.tokenHash),
    // The list on the account page, and the count of a person's active tokens.
    index("api_tokens_user_id_idx").on(table.userId),
  ],
);
