import { pgEnum, pgTable, timestamp, uniqueIndex, uuid, varchar } from "drizzle-orm/pg-core";
import { users } from "./users.js";

export const oauthProvider = pgEnum("oauth_provider", ["google", "github"]);

/**
 * One row per way a person can sign in through another service (ADR 0042). `providerUserId` is the provider's own
 * stable id for the person (never the email: emails change); the pair is unique, so one Google account can belong to
 * only one FlowDesc user. A user has at most one identity per provider.
 */
export const oauthIdentities = pgTable(
  "oauth_identities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: oauthProvider("provider").notNull(),
    providerUserId: varchar("provider_user_id", { length: 255 }).notNull(),
    // The provider's email when it was linked; shown on the account page, never used to sign in.
    email: varchar("email", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("oauth_identities_provider_user_unique").on(table.provider, table.providerUserId),
    uniqueIndex("oauth_identities_user_provider_unique").on(table.userId, table.provider),
  ],
);
