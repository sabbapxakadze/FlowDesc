import { pgTable, uuid, varchar, timestamp, index } from "drizzle-orm/pg-core";

/**
 * One row each time someone clicks "Try the demo" (ADR 0076): `started` when a copy was made, `busy` when the cap of live copies refused it.
 * It exists because the copies themselves are deleted, so nothing else remembers how many there were. Deliberately nothing personal and no
 * link to the copy (no user, organization, email or address): the row must stay meaningful, and harmless, after the copy is gone.
 */
export const demoStarts = pgTable(
  "demo_starts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    outcome: varchar("outcome", { length: 16 }).$type<"started" | "busy">().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Counting per day (the query in ADR 0076) reads by time.
  (table) => [index("demo_starts_created_at_idx").on(table.createdAt)],
);
