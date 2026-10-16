import { sql } from "drizzle-orm";
import { rm } from "node:fs/promises";
import { db } from "./client.js";
import { env } from "../config/env.js";

/**
 * Truncates every app table. Call from beforeEach so tests never depend on
 * — or leak into — state left by another test. CASCADE handles the
 * projects -> organizations foreign key without needing table order.
 */
export async function resetDatabase() {
  await db.execute(
    sql`TRUNCATE TABLE organizations, projects, users, organization_members, sessions, auth_tokens, issues, issue_events, labels, issue_labels, comments, sprints, notifications, attachments, invitations, audit_events, oauth_identities, api_tokens, demo_starts RESTART IDENTITY CASCADE`,
  );
}

/**
 * Same role for lib/storage.ts's on-disk files that resetDatabase plays
 * for Postgres. env.UPLOADS_DIR is already pointed at uploads-test by
 * db/test-setup.ts by the time this runs — never the real dev uploads
 * directory. force: true means a not-yet-created directory is a no-op,
 * not an error.
 */
export async function clearTestUploads() {
  await rm(env.UPLOADS_DIR, { recursive: true, force: true });
}
