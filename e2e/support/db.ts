import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";

/**
 * Direct database access for test setup only (never for assertions about what
 * the user sees: those go through the browser). Connects to the SAME database
 * the e2e API uses, flowdesk_test.
 */
try {
  process.loadEnvFile(fileURLToPath(new URL("../../apps/api/.env", import.meta.url)));
} catch {
  // fine if TEST_DATABASE_URL is already in the environment
}

const connectionString = process.env.TEST_DATABASE_URL;
if (!connectionString) {
  throw new Error("TEST_DATABASE_URL must be set to run e2e tests");
}

const pool = new pg.Pool({ connectionString, max: 2 });

/** Same table list as the API tests' resetDatabase (apps/api/src/db/test-utils.ts). */
export async function resetDatabase() {
  await pool.query(
    "TRUNCATE TABLE organizations, projects, users, organization_members, sessions, auth_tokens, issues, issue_events, labels, issue_labels, comments, sprints, notifications, attachments, invitations, audit_events, oauth_identities, demo_starts RESTART IDENTITY CASCADE",
  );
}

/** Makes every audit row `days` days older, so a test can see how an old time is written (rows are otherwise "just now"). */
export async function backdateAuditEvents(days: number) {
  await pool.query("UPDATE audit_events SET created_at = created_at - make_interval(days => $1)", [days]);
}

/**
 * Marks a person's guided tour as already started (ADR 0052). A new account gets the tour on its own on its first visit, and its overlay
 * would sit over the page in every test that is not about the tour, so the fixtures call this for the people they make.
 */
export async function markTourSeen(email: string) {
  await pool.query("UPDATE users SET tour_seen_at = now() WHERE email = $1 AND tour_seen_at IS NULL", [email]);
}

/**
 * A second person in an organization, inserted directly (the invitation flow has
 * its own e2e test; most tests just need another member quickly): a new user that
 * reuses the existing user's password hash (so both log in with the same password,
 * with no hashing library needed here) and a membership in that user's organization.
 */
export async function addOrgMember(
  existingEmail: string,
  member: { email: string; name: string },
) {
  const { rowCount } = await pool.query(
    `WITH base AS (
       SELECT u.password_hash, m.organization_id
       FROM users u JOIN organization_members m ON m.user_id = u.id
       WHERE u.email = $1
       LIMIT 1
     ), new_user AS (
       INSERT INTO users (email, password_hash, name, tour_seen_at)
       SELECT $2, password_hash, $3, now() FROM base
       RETURNING id
     )
     INSERT INTO organization_members (organization_id, user_id, role)
     SELECT base.organization_id, new_user.id, 'member' FROM base, new_user`,
    [existingEmail, member.email, member.name],
  );
  if (rowCount !== 1)
    throw new Error(`No user ${existingEmail} to copy an organization from`);
}

/**
 * An email-change confirmation link for a person, made directly: the raw token only ever exists in the email (the
 * database keeps its sha256 hash), and e2e emails are never delivered. Returns the raw token for the link.
 */
export async function issueEmailChangeToken(userEmail: string, newEmail: string, expiresInMs = 60 * 60 * 1000): Promise<string> {
  const raw = randomBytes(24).toString("base64url");
  const { rowCount } = await pool.query(
    `INSERT INTO auth_tokens (user_id, purpose, token_hash, expires_at, new_email)
     SELECT id, 'email_change', $2, now() + ($3 || ' milliseconds')::interval, $4 FROM users WHERE email = $1`,
    [userEmail, createHash("sha256").update(raw).digest("hex"), String(expiresInMs), newEmail],
  );
  if (rowCount !== 1) throw new Error(`No user ${userEmail}`);
  return raw;
}

export async function closeDatabase() {
  await pool.end();
}
