import { sql } from "drizzle-orm";
import {
  pgTable,
  pgEnum,
  uuid,
  varchar,
  text,
  integer,
  numeric,
  timestamp,
  date,
  index,
  uniqueIndex,
  customType,
} from "drizzle-orm/pg-core";
import { organizations } from "./organizations.js";
import { projects } from "./projects.js";
import { users } from "./users.js";
import { sprints } from "./sprints.js";

export const issueStatus = pgEnum("issue_status", ["todo", "in_progress", "done"]);

// Phase 8.5 slice 2. "none" is a real value, not NULL: one fewer case to
// handle everywhere, and a scalar DEFAULT means adding the column needs no
// backfill step (unlike board_rank, ADR 0007).
export const issuePriority = pgEnum("issue_priority", ["none", "low", "medium", "high", "urgent"]);

// Drizzle's pg-core has no first-class tsvector column type (confirmed
// by checking pg-core/columns/ — there's no tsvector.ts). Same
// "round-tripped as an opaque string, never parsed" precedent as
// board_rank (ADR 0007): the value only ever matters to Postgres itself
// (the @@ match and ts_rank in issues.repository.ts's search()), never
// something application code reads or constructs.
const tsvectorType = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

/**
 * organizationId is denormalized here (not just projectId) so every
 * tenant-scoped query can filter on it directly instead of joining to
 * projects — same choice projects itself makes relative to organizations.
 * See CLAUDE.md's repository rule and ADR 0004.
 *
 * number is per-project (see projects.nextIssueNumber), not global — the
 * human-readable key (e.g. "AUTH-23") is projects.key + "-" + number,
 * computed on read, never stored.
 *
 * version starts unused (always 1) — slice 2 adds the optimistic-
 * concurrency PATCH that reads/writes it. Added now because it's schema,
 * not behavior.
 */
export const issues = pgTable(
  "issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    title: varchar("title", { length: 500 }).notNull(),
    description: text("description"),
    status: issueStatus("status").notNull().default("todo"),
    priority: issuePriority("priority").notNull().default("none"),
    // A calendar day, not a moment (ADR 0032): Postgres `date`, read back as "YYYY-MM-DD", never converted to a timestamp,
    // so it cannot move a day with timezones. Null = no due date.
    dueDate: date("due_date"),
    // Nullable = unassigned. set null (not cascade): deleting a user must not
    // delete their issues. That the assignee belongs to THIS organization is
    // not expressible as a foreign key (the link is through
    // organization_members), so the service checks it on every assignment.
    assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
    reporterId: uuid("reporter_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    // Added nullable (migration 0008), backfilled, then set NOT NULL
    // (migration 0009's hand-written SQL — no scalar DEFAULT can express
    // "append per (project, status) group"). See ADR 0007 for the whole
    // ranking scheme: numeric (exact decimal, never a float) so repeated
    // bisection between the same two neighbors never loses precision;
    // never parsed into a JS number, only ever round-tripped as a string.
    boardRank: numeric("board_rank").notNull(),
    // The order of the sprints-page lists (ADR 0008, amended): one rank for whichever list the issue is
    // in, the backlog (sprint_id IS NULL) or one sprint. Same scheme as board_rank (ADR 0007), but
    // meaningful only inside its current list. Added nullable, backfilled and set NOT NULL in migration 0024.
    backlogRank: numeric("backlog_rank").notNull(),
    // Nullable = backlog. onDelete: "set null" (not "cascade") — a sprint
    // isn't a tenant boundary, so removing one returns its issues to the
    // backlog instead of deleting them. See Phase 5 slice 4's plan.
    sprintId: uuid("sprint_id").references(() => sprints.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    // Generated, not maintained by application code — self-populates for
    // every row (including existing ones) the moment the column is
    // added, so unlike board_rank this needs no backfill migration.
    // title outweighs description ('A' vs 'B') so a title match ranks
    // above a description-only match in ts_rank. See Phase 7 slice 1's
    // plan and the new search() repository function.
    searchVector: tsvectorType("search_vector").generatedAlwaysAs(
      // The description is Markdown with picture and mention tokens (ADR 0063): the picture token is dropped and a mention token reduced to the name, so
      // searching "attachment" or an id finds nothing by accident. Bracket classes instead of backslashes keep the pattern the same in SQL and in this string.
      sql`setweight(to_tsvector('english', coalesce(title, '')), 'A') || setweight(to_tsvector('english', regexp_replace(regexp_replace(coalesce(description, ''), '![[][^]]*[]][(]attachment:[0-9a-fA-F-]{36}[)]', ' ', 'g'), '@[[]([^]]*)[]][(]user:[0-9a-fA-F-]{36}[)]', '\\1', 'g')), 'B')`,
    ),
  },
  (table) => [
    index("issues_organization_id_idx").on(table.organizationId),
    // Composite, not a bare project_id index: serves both the plain
    // project-scoped lookup and the keyset-paginated list query's
    // WHERE (created_at, id) < (cursor) ... ORDER BY created_at DESC, id
    // DESC — verified with EXPLAIN ANALYZE, see docs/roadmap.md's Phase 4
    // slice 1 entry. A separate single-column index would be redundant.
    index("issues_project_id_created_at_id_idx").on(
      table.projectId,
      table.createdAt,
      table.id,
    ),
    // Serves the list sorted by priority (ADR 0026): ORDER BY priority, created_at, id
    // under WHERE project_id = ?, including its keyset cursor condition
    // (priority, created_at, id) < (...). Measured at 20,000 issues in one project: the first
    // page went from 7.6 ms (scan and sort every row) to 0.05 ms (26 rows read).
    index("issues_project_id_priority_created_at_id_idx").on(
      table.projectId,
      table.priority,
      table.createdAt,
      table.id,
    ),
    // Matches the board query's WHERE project_id = ? ORDER BY status,
    // board_rank, id exactly — index-only ordering, no sort step. As a
    // prefix, also serves a future per-column neighbor lookup (WHERE
    // project_id = ? AND status = ? ORDER BY board_rank). See ADR 0007.
    index("issues_project_id_status_board_rank_id_idx").on(
      table.projectId,
      table.status,
      table.boardRank,
      table.id,
    ),
    uniqueIndex("issues_project_id_number_unique").on(table.projectId, table.number),
    // Serves both the backlog query (sprint_id IS NULL) and the
    // active-sprint query (sprint_id = ?), both scoped to a project.
    index("issues_project_id_sprint_id_idx").on(table.projectId, table.sprintId),
    // The sprints-page lists in rank order: WHERE project_id = ? AND sprint_id (IS NULL | = ?) ORDER BY
    // backlog_rank, id, plus the neighbour lookups of a move. (The plain (project_id, sprint_id) index above is
    // now a prefix of this one; it is left in place rather than dropped in the same migration.)
    index("issues_project_id_sprint_id_backlog_rank_id_idx").on(
      table.projectId,
      table.sprintId,
      table.backlogRank,
      table.id,
    ),
    // GIN, not the default btree — the only index type that can serve a
    // tsvector @@ tsquery match. See search() in issues.repository.ts.
    index("issues_search_vector_idx").using("gin", table.searchVector),
  ],
);
