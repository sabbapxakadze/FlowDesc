import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db, pool } from "./client.js";
import {
  issueEvents,
  issueLabels,
  issues,
  labels,
  organizationMembers,
  organizations,
  projects,
  sprints,
  users,
} from "./schema/index.js";

// Small deterministic PRNG (mulberry32): the same seed always yields the
// same history, so the chart looks the same every time it is rebuilt.
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type SeedEvent = { type: string; payload: Record<string, unknown>; at: number };
type Status = "todo" | "in_progress" | "done";

/**
 * ~100 issues with backdated history over the last 12 weeks, so the
 * Phase 8 charts have something real to show. Inserts issues and
 * issue_events directly with explicit created_at — the real repository
 * functions always stamp now(), and going through writeIssueEvent would
 * also fan out notifications. Deliberately includes the shapes the
 * analytics query must handle: moves through in_progress, status changes
 * made via issue.updated, later edits that resend an unchanged
 * status: done (must NOT count), and a few reopened issues (count
 * again). Skipped when the project already has issues, so re-running the
 * seed is a no-op. Timestamps are relative to when the seed runs.
 */
async function seedAnalyticsDemo(organizationId: string) {
  await db
    .insert(projects)
    .values({ organizationId, name: "Analytics Demo", key: "ANL" })
    .onConflictDoNothing({ target: [projects.organizationId, projects.key] });
  const demoProject = await db.query.projects.findFirst({
    where: and(eq(projects.organizationId, organizationId), eq(projects.key, "ANL")),
  });
  if (!demoProject) throw new Error("Failed to create or find the analytics demo project");

  const existing = await db.query.issues.findFirst({ where: eq(issues.projectId, demoProject.id) });
  if (existing) {
    // Issues were seeded by an earlier run; still make sure the sprint
    // history exists (added later, so older seeded orgs need it too).
    await seedSprintHistory(demoProject.id, organizationId);
    await seedLabels(demoProject.id, organizationId);
    return;
  }

  await db
    .insert(users)
    .values({ email: "analytics-demo@flowdesc.test", passwordHash: "not-a-real-hash", name: "Demo Teammate" })
    .onConflictDoNothing({ target: users.email });
  const demoUser = await db.query.users.findFirst({ where: eq(users.email, "analytics-demo@flowdesc.test") });
  if (!demoUser) throw new Error("Failed to create or find the analytics demo user");
  await db.insert(organizationMembers).values({ organizationId, userId: demoUser.id, role: "member" }).onConflictDoNothing();

  const rand = mulberry32(8);
  const DAY = 86_400_000;
  const now = Date.now();
  const issueRows: (typeof issues.$inferInsert)[] = [];
  const eventRows: (typeof issueEvents.$inferInsert)[] = [];

  for (let n = 1; n <= 100; n++) {
    const createdAt = now - (rand() * 84 + 0.5) * DAY;
    const title = `Demo issue ${n}`;
    const events: SeedEvent[] = [{ type: "issue.created", payload: { title }, at: createdAt }];
    let status: Status = "todo";
    let t = createdAt;

    // Adds an event some days after the last one; false once it would land in the future.
    const step = (minDays: number, maxDays: number, type: string, payload: Record<string, unknown>) => {
      const next = t + (minDays + rand() * (maxDays - minDays)) * DAY;
      if (next > now) return false;
      t = next;
      events.push({ type, payload, at: t });
      return true;
    };
    const moveTo = (to: Status) => {
      const from = status;
      if (step(0.5, 6, "issue.moved", { fromStatus: from, toStatus: to })) status = to;
      return status === to;
    };

    const roll = rand();
    if (roll >= 0.15) {
      if (rand() < 0.6) moveTo("in_progress");
      if (roll >= 0.3) {
        let reached: boolean;
        if (rand() < 0.3) {
          // Finished through the edit form: an issue.updated carrying status.
          reached = step(0.5, 8, "issue.updated", { status: "done" });
          if (reached) status = "done";
        } else {
          reached = moveTo("done");
        }
        if (reached && rand() < 0.25) {
          // Editing a done issue resends its unchanged status: must not count.
          step(1, 10, "issue.updated", { title: `${title} (edited)`, status: "done" });
        }
        if (reached && rand() < 0.1 && moveTo("in_progress")) moveTo("done");
      }
    }

    const id = randomUUID();
    issueRows.push({
      id,
      organizationId,
      projectId: demoProject.id,
      number: n,
      title,
      status,
      reporterId: demoUser.id,
      boardRank: String(n * 1000),
      backlogRank: String(n * 1000),
      createdAt: new Date(createdAt),
      updatedAt: new Date(t),
    });
    for (const e of events) {
      eventRows.push({ issueId: id, actorId: demoUser.id, type: e.type, payload: e.payload, createdAt: new Date(e.at) });
    }
  }

  await db.insert(issues).values(issueRows);
  await db.insert(issueEvents).values(eventRows);
  await db.update(projects).set({ nextIssueNumber: 101 }).where(eq(projects.id, demoProject.id));
  console.log(`Seeded ${issueRows.length} analytics demo issues (${eventRows.length} events) in project ANL.`);
  await seedSprintHistory(demoProject.id, organizationId);
  await seedLabels(demoProject.id, organizationId);
}

/**
 * Five labels attached to a deterministic ~65% of the project's issues (a
 * quarter of those get a second label), skewed so some labels are clearly
 * more common than others — enough variety for the label breakdown to show
 * something. Rows only, no issue.label_added events: a seed shortcut, unlike
 * the real attach path. Skipped when the org already has a label named
 * "bug", so re-running is a no-op and an org's own labels are left alone.
 */
async function seedLabels(projectId: string, organizationId: string) {
  const existing = await db.query.labels.findFirst({
    where: and(eq(labels.organizationId, organizationId), eq(labels.name, "bug")),
  });
  if (existing) return;

  const names = ["bug", "feature", "design", "docs", "tech-debt"];
  const colors = ["#dc2626", "#2563eb", "#9333ea", "#059669", "#d97706"];
  await db
    .insert(labels)
    .values(names.map((name, i) => ({ organizationId, name, color: colors[i]! })))
    .onConflictDoNothing();
  const labelRows = await db
    .select({ id: labels.id, name: labels.name })
    .from(labels)
    .where(eq(labels.organizationId, organizationId));
  const labelIds = names.map((name) => labelRows.find((l) => l.name === name)!.id);

  const projectIssues = await db
    .select({ id: issues.id })
    .from(issues)
    .where(eq(issues.projectId, projectId))
    .orderBy(asc(issues.number));

  const rand = mulberry32(34);
  const rows: (typeof issueLabels.$inferInsert)[] = [];
  for (const issue of projectIssues) {
    if (rand() < 0.35) continue;
    const first = Math.floor(rand() ** 1.6 * labelIds.length);
    rows.push({ issueId: issue.id, labelId: labelIds[first]! });
    if (rand() < 0.25) {
      const second = (first + 1 + Math.floor(rand() * (labelIds.length - 1))) % labelIds.length;
      rows.push({ issueId: issue.id, labelId: labelIds[second]! });
    }
  }
  await db.insert(issueLabels).values(rows).onConflictDoNothing();
  console.log(`Seeded ${names.length} labels attached to ${rows.length} issue-label pairs in project ANL.`);
}

/**
 * Six completed two-week sprints for the velocity chart, built from the
 * project's already-seeded issues. Writes what the real code writes: a
 * sprint_assigned event when an issue joins, and — at the close, all at the
 * same instant like complete()'s single transaction — a sprint_removed
 * event with reason "sprint_completed" for every issue still in the sprint.
 * Those release events are what velocity reads (ADR 0011). Whether an issue
 * counts as done is decided from its own status events as of the close, so
 * some issues genuinely carry over into the next sprint. Skipped when the
 * project already has a sprint, so re-running is a no-op.
 */
async function seedSprintHistory(projectId: string, organizationId: string) {
  const existingSprint = await db.query.sprints.findFirst({ where: eq(sprints.projectId, projectId) });
  if (existingSprint) return;

  const projectIssues = await db
    .select({ id: issues.id, createdAt: issues.createdAt, reporterId: issues.reporterId })
    .from(issues)
    .where(eq(issues.projectId, projectId));
  if (projectIssues.length === 0) return;

  const rows = await db
    .select({ issueId: issueEvents.issueId, type: issueEvents.type, payload: issueEvents.payload, createdAt: issueEvents.createdAt })
    .from(issueEvents)
    .where(inArray(issueEvents.issueId, projectIssues.map((i) => i.id)))
    .orderBy(asc(issueEvents.createdAt));

  const statusEvents = new Map<string, Array<{ at: number; status: string }>>();
  for (const row of rows) {
    const payload = row.payload as Record<string, string>;
    const status = row.type === "issue.moved" ? payload.toStatus : row.type === "issue.updated" ? payload.status : undefined;
    if (!status) continue;
    statusEvents.set(row.issueId, [...(statusEvents.get(row.issueId) ?? []), { at: row.createdAt.getTime(), status }]);
  }
  const statusAt = (issueId: string, at: number) => {
    let status = "todo";
    for (const event of statusEvents.get(issueId) ?? []) {
      if (event.at > at) break;
      status = event.status;
    }
    return status;
  };

  const rand = mulberry32(21);
  const DAY = 86_400_000;
  const now = Date.now();
  const actorId = projectIssues[0]!.reporterId;
  const sprintRows: (typeof sprints.$inferInsert)[] = [];
  const eventRows: (typeof issueEvents.$inferInsert)[] = [];
  const finishedEarlier = new Set<string>();

  for (let k = 0; k < 6; k++) {
    const end = now - (5 - k) * 14 * DAY - DAY;
    const start = end - 14 * DAY;
    const sprintId = randomUUID();
    const name = `Sprint ${k + 1}`;
    sprintRows.push({
      id: sprintId,
      organizationId,
      projectId,
      name,
      status: "completed",
      startDate: new Date(start).toISOString().slice(0, 10),
      endDate: new Date(end).toISOString().slice(0, 10),
      version: 3, // planned -> active -> completed
      createdAt: new Date(start - DAY),
      updatedAt: new Date(end),
    });

    for (const issue of projectIssues) {
      if (finishedEarlier.has(issue.id)) continue;
      const created = issue.createdAt.getTime();
      if (created > end - 4 * DAY) continue;
      if (rand() > 0.22) continue;

      const assignedAt = Math.max(created + 3_600_000, start);
      eventRows.push({ issueId: issue.id, actorId, type: "issue.sprint_assigned", payload: { sprintId, sprintName: name }, createdAt: new Date(assignedAt) });
      eventRows.push({
        issueId: issue.id,
        actorId,
        type: "issue.sprint_removed",
        payload: { sprintId, sprintName: name, reason: "sprint_completed" },
        createdAt: new Date(end),
      });
      if (statusAt(issue.id, end) === "done") finishedEarlier.add(issue.id);
    }
  }

  await db.insert(sprints).values(sprintRows);
  await db.insert(issueEvents).values(eventRows);
  console.log(`Seeded ${sprintRows.length} completed sprints (${eventRows.length} events) in project ANL.`);
}

/**
 * Local dev seed data. Safe to run more than once — onConflictDoNothing
 * keyed on the unique slug/key means a re-run is a no-op, not a crash.
 * This is also the demo organization Phase 9's "log in as demo" flow will
 * point at.
 */
async function seed() {
  // SEED_ORG_SLUG lets the demo data be seeded into an existing org (e.g. a
  // real account you can log in as) instead of the fixed demo-org.
  const slug = process.env.SEED_ORG_SLUG ?? "demo-org";
  const [demoOrg] = await db
    .insert(organizations)
    .values({ name: slug === "demo-org" ? "Demo Org" : slug, slug })
    .onConflictDoNothing({ target: organizations.slug })
    .returning();

  const org = demoOrg ?? (await db.query.organizations.findFirst({
    where: (fields, { eq }) => eq(fields.slug, slug),
  }));

  if (!org) {
    throw new Error("Failed to create or find the demo organization");
  }

  await db
    .insert(projects)
    .values([
      { organizationId: org.id, name: "Website", key: "WEB" },
      { organizationId: org.id, name: "Backend API", key: "API" },
    ])
    .onConflictDoNothing({ target: [projects.organizationId, projects.key] });

  await seedAnalyticsDemo(org.id);

  console.log(`Seeded organization "${org.slug}" (${org.id}) with its projects.`);
}

seed()
  .catch((err: unknown) => {
    console.error("Seed failed:", err);
    process.exitCode = 1;
  })
  .finally(() => {
    void pool.end();
  });
