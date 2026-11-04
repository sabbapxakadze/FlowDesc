import { pgTable, uuid, varchar, integer, real, timestamp, index } from "drizzle-orm/pg-core";

/**
 * How a question to Ask FlowDesc ended (ADR 0077). `started` is the moment it was accepted and is replaced when it ends. `no_sources` means the model
 * was not called (nothing was found, or the answer came straight from the facts). `limited` means it was refused by a limit.
 */
export type AiOutcome = "started" | "answered" | "no_sources" | "limited" | "provider_error";

/**
 * One row per question to Ask FlowDesc, so the limits survive a restart and the owner can read usage (ADR 0077, decision 7). **It holds no question, no
 * answer and no source text**: only who (a plain id, deliberately NOT a foreign key, so the row outlives a demo copy and its person, like `demo_starts`),
 * how it ended, how many sources were read, and the Neurons the provider said it used. Rows older than 30 days are deleted as new questions come in.
 */
export const aiRequests = pgTable(
  "ai_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    outcome: varchar("outcome", { length: 16 }).$type<AiOutcome>().notNull(),
    sourcesCount: integer("sources_count").notNull().default(0),
    // What `usage.neurons` said for the call; null when there was no call or the provider did not say.
    neurons: real("neurons"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // "This person's questions in the last hour / day": the per-person limits.
    index("ai_requests_user_id_created_at_idx").on(table.userId, table.createdAt),
    // "Everyone's questions today (UTC)" and the 30-day clean-up.
    index("ai_requests_created_at_idx").on(table.createdAt),
  ],
);
