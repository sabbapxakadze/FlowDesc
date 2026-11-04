import { sql } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { issues, tsvectorType } from "./issues.js";
import { users } from "./users.js";

/**
 * The real source of truth for a comment's content — the timeline
 * (issue_events) carries a copy of the body for rendering without a
 * join, but this table is what a future edit/delete feature would touch.
 * Same "entity table stays the read model" reasoning ADR 0005 uses for
 * issues themselves.
 */
export const comments = pgTable(
  "comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Searchable text for "Ask FlowDesc" (ADR 0077): generated like issues.search_vector and cleaned the same way (a picture token dropped, a mention token
    // reduced to the name), so a question about "attachment" or an id finds nothing by accident. It follows an edit by itself, and a deleted comment is a
    // deleted row, so its text can never be found. Read only by the ask module's repository.
    searchVector: tsvectorType("search_vector").generatedAlwaysAs(
      sql`to_tsvector('english', regexp_replace(regexp_replace(coalesce(body, ''), '![[][^]]*[]][(]attachment:[0-9a-fA-F-]{36}[)]', ' ', 'g'), '@[[]([^]]*)[]][(]user:[0-9a-fA-F-]{36}[)]', '\\1', 'g'))`,
    ),
  },
  (table) => [
    index("comments_issue_id_idx").on(table.issueId),
    index("comments_search_vector_idx").using("gin", table.searchVector),
  ],
);
