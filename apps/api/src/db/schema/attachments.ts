import { pgTable, uuid, varchar, integer, timestamp, index, boolean } from "drizzle-orm/pg-core";
import { comments } from "./comments.js";
import { issues } from "./issues.js";
import { users } from "./users.js";

/**
 * No organizationId column — every real read is already issue-scoped
 * (requireIssue already ran before any of these queries), same "join
 * through issues, don't denormalize" precedent comments/issue_events
 * already use. storageKey is opaque to clients — the on-disk filename
 * under lib/storage.ts's UPLOADS_DIR, never derived from the original
 * filename (which is untrusted user input). See Phase 7 slice 4's plan.
 */
export const attachments = pgTable(
  "attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    issueId: uuid("issue_id")
      .notNull()
      .references(() => issues.id, { onDelete: "cascade" }),
    uploaderId: uuid("uploader_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    filename: varchar("filename", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 255 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: varchar("storage_key", { length: 255 }).notNull(),
    // Set when the file was attached to a comment. SET NULL, not CASCADE:
    // deleting a comment must never destroy its files (owner decision), so
    // they fall back to being ordinary issue attachments. Still an issue
    // attachment either way: the issue's Attachments list shows comment files
    // too, never the other way round (a direct upload has no comment).
    commentId: uuid("comment_id").references(() => comments.id, { onDelete: "set null" }),
    // A picture pasted into the comment box that is not posted yet (ADR 0062): no event, no notification, not listed with the issue's
    // files. Posting the comment that shows it links it (comment_id set, draft false); one never posted is deleted after 24 hours.
    draft: boolean("draft").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("attachments_issue_id_idx").on(table.issueId),
    index("attachments_comment_id_idx").on(table.commentId),
  ],
);
