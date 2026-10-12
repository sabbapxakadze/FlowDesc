import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { and, eq, gt, inArray, sql } from "drizzle-orm";
import { mentionedUserIds } from "@flowdesc/contracts";
import { app } from "../app.js";
import { db } from "./client.js";
import { resetDatabase } from "./test-utils.js";
import {
  auditEvents,
  comments,
  invitations,
  issueEvents,
  issues,
  notifications,
  organizationMembers,
  organizations,
  projects,
  sprints,
  users,
} from "./schema/index.js";
import { seedDemo } from "./seed-demo.js";
import { DEMO_ORG_SLUG, DEMO_PASSWORD, PEOPLE } from "./seed-demo-data.js";

/**
 * The demo organization (ADR 0039). Real Postgres, real HTTP. These are not "does it run" checks: a demo that logs in but whose
 * numbers, ranks, events or dates are inconsistent would break the very screens it exists to show. Each test says what it catches.
 */

function login(email: string, password = DEMO_PASSWORD) {
  return request(app).post("/api/v1/auth/login").send({ email, password });
}

async function demoSession(email = PEOPLE.alex.email) {
  const res = await login(email).expect(200);
  return {
    organizationId: res.body.organization.id as string,
    auth: { Authorization: `Bearer ${res.body.accessToken as string}` },
    userId: res.body.user.id as string,
  };
}

describe("demo organization seed", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("builds the organization, and the demo owner can log in with the published password", async () => {
    // Catches: a hash that does not match the password, an unverified or missing membership, a wrong role.
    const result = await seedDemo();
    expect(result.created).toBe(true);
    expect(result.people).toBe(5);

    const res = await login(PEOPLE.alex.email).expect(200);
    expect(res.body.organization.slug ?? DEMO_ORG_SLUG).toBe(DEMO_ORG_SLUG);
    expect(res.body.user.name).toBe("Alex Morgan");

    const org = await db.query.organizations.findFirst({
      where: eq(organizations.slug, DEMO_ORG_SLUG),
    });
    const members = await db
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.organizationId, org!.id));
    expect(members.map((m) => m.role).sort()).toEqual([
      "admin",
      "member",
      "member",
      "owner",
      "viewer",
    ]);

    await login(PEOPLE.alex.email, "wrong-password").expect(401);
  });

  it("a viewer can look but not create; the owner can create (the roles are real)", async () => {
    // Catches: every demo person having the same rights, which would make the Members and role features meaningless.
    await seedDemo();
    const owner = await demoSession();
    const viewer = await demoSession(PEOPLE.daniel.email);
    const projectsRes = await request(app)
      .get(`/api/v1/organizations/${owner.organizationId}/projects`)
      .set(owner.auth)
      .expect(200);
    const web = (projectsRes.body.data as { id: string; key: string }[]).find(
      (p) => p.key === "WEB",
    )!;
    const base = `/api/v1/organizations/${owner.organizationId}/projects/${web.id}/issues`;
    await request(app).get(base).set(viewer.auth).expect(200);
    await request(app)
      .post(base)
      .set(viewer.auth)
      .send({ title: "Viewer tries" })
      .expect(403);
    await request(app)
      .post(base)
      .set(owner.auth)
      .send({ title: "Owner creates" })
      .expect(201);
  });

  it("three projects with the planned number of issues, numbered 1..n with the next number ready", async () => {
    // Catches: duplicate or skipped issue numbers, and a stale counter that would make the next created issue collide.
    await seedDemo();
    const rows = await db.select().from(projects);
    expect(rows.map((p) => p.key).sort()).toEqual(["API", "APP", "WEB"]);
    const expected: Record<string, number> = { WEB: 30, APP: 23, API: 23 };
    for (const project of rows) {
      const numbers = (
        await db
          .select({ n: issues.number })
          .from(issues)
          .where(eq(issues.projectId, project.id))
      )
        .map((r) => r.n)
        .sort((a, b) => a - b);
      expect(numbers).toEqual(
        Array.from({ length: expected[project.key]! }, (_, i) => i + 1),
      );
      expect(project.nextIssueNumber).toBe(expected[project.key]! + 1);
    }
  });

  it("every column has distinct ranks, and the board and backlog endpoints return what the tables hold", async () => {
    // Catches: equal ranks (drag and drop would misplace cards), and a board that does not match the stored issues.
    await seedDemo();
    const owner = await demoSession();
    for (const project of await db.select().from(projects)) {
      const rows = await db.select().from(issues).where(eq(issues.projectId, project.id));
      for (const status of ["todo", "in_progress", "done"] as const) {
        const ranks = rows.filter((r) => r.status === status).map((r) => r.boardRank);
        expect(new Set(ranks).size, `${project.key} ${status} board ranks`).toBe(
          ranks.length,
        );
      }
      const groups = new Map<string, string[]>();
      for (const r of rows)
        groups.set(r.sprintId ?? "backlog", [
          ...(groups.get(r.sprintId ?? "backlog") ?? []),
          r.backlogRank,
        ]);
      for (const [group, ranks] of groups)
        expect(new Set(ranks).size, `${project.key} ${group} backlog ranks`).toBe(
          ranks.length,
        );

      const board = await request(app)
        .get(`/api/v1/organizations/${owner.organizationId}/projects/${project.id}/board`)
        .set(owner.auth)
        .expect(200);
      expect((board.body.data as unknown[]).length).toBe(rows.length);
    }
  });

  it("nothing is dated in the future, and every issue starts with a created event", async () => {
    // Catches: a timestamp that lands tomorrow (breaking "created 3 days ago", charts and the edited flag), and issues with no history.
    await seedDemo();
    const soon = new Date(Date.now() + 5_000);
    const future = await Promise.all([
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(issues)
        .where(gt(issues.createdAt, soon)),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(issues)
        .where(gt(issues.updatedAt, soon)),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(issueEvents)
        .where(gt(issueEvents.createdAt, soon)),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(comments)
        .where(gt(comments.createdAt, soon)),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(notifications)
        .where(gt(notifications.createdAt, soon)),
      db
        .select({ c: sql<number>`count(*)::int` })
        .from(auditEvents)
        .where(gt(auditEvents.createdAt, soon)),
    ]);
    expect(future.map((r) => r[0]!.c)).toEqual([0, 0, 0, 0, 0, 0]);

    const created = await db
      .select({ issueId: issueEvents.issueId })
      .from(issueEvents)
      .where(eq(issueEvents.type, "issue.created"));
    const all = await db.select({ id: issues.id }).from(issues);
    expect(new Set(created.map((c) => c.issueId)).size).toBe(all.length);
    expect(created.length).toBe(all.length); // exactly one each
  });

  it("every issue's last updated time is its latest event, and a done issue was moved to done", async () => {
    // Catches: a card that says "updated 2 weeks ago" next to a timeline entry from yesterday; a done issue with no way it got there.
    await seedDemo();
    const rows = await db.select().from(issues);
    const events = await db.select().from(issueEvents);
    for (const issue of rows) {
      const mine = events.filter((e) => e.issueId === issue.id);
      const latest = Math.max(...mine.map((e) => e.createdAt.getTime()));
      expect(issue.updatedAt.getTime(), issue.title).toBe(latest);
      if (issue.status === "done") {
        expect(
          mine.some(
            (e) =>
              e.type === "issue.moved" &&
              (e.payload as { toStatus?: string }).toStatus === "done",
          ),
          issue.title,
        ).toBe(true);
      }
    }
  });

  it("the owner's notifications point at real events on issues in the organization: five unread, the rest read", async () => {
    // Catches: a notification whose event was never written (the bell would crash or show nothing), or all read / all unread.
    await seedDemo();
    const owner = await demoSession();
    const mine = await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, owner.userId));
    expect(mine.length).toBeGreaterThanOrEqual(7);
    const events = await db
      .select()
      .from(issueEvents)
      .where(
        inArray(
          issueEvents.id,
          mine.map((n) => n.issueEventId),
        ),
      );
    expect(events.length).toBe(mine.length);
    expect(mine.filter((n) => n.readAt === null).length).toBe(5);

    const count = await request(app)
      .get(`/api/v1/organizations/${owner.organizationId}/notifications/unread-count`)
      .set(owner.auth)
      .expect(200);
    expect(count.body.data?.count ?? count.body.count).toBe(5);
  });

  it("comments carry real @mention tokens of members, with an event each; an edited one reads edited and a deleted one is gone", async () => {
    // Catches: a mention token that points at nobody (rendered as plain text), a comment without its timeline event, or a "deleted" comment still shown.
    await seedDemo();
    const rows = await db.select().from(comments);
    expect(rows.length).toBeGreaterThanOrEqual(20);
    const memberIds = new Set(
      (
        await db
          .select({ id: users.id })
          .from(users)
          .where(
            inArray(
              users.email,
              Object.values(PEOPLE).map((p) => p.email),
            ),
          )
      ).map((u) => u.id),
    );
    const commented = await db
      .select()
      .from(issueEvents)
      .where(eq(issueEvents.type, "issue.commented"));
    for (const comment of rows) {
      expect(
        commented.some(
          (e) => (e.payload as { commentId?: string }).commentId === comment.id,
        ),
        "event for comment",
      ).toBe(true);
      for (const id of mentionedUserIds(comment.body))
        expect(memberIds.has(id), "mention of a member").toBe(true);
    }
    expect(rows.some((c) => c.body.includes("](user:"))).toBe(true);
    expect(rows.some((c) => c.updatedAt.getTime() > c.createdAt.getTime() + 60_000)).toBe(
      true,
    ); // edited
    const deleted = await db
      .select()
      .from(issueEvents)
      .where(eq(issueEvents.type, "issue.comment_deleted"));
    expect(deleted.length).toBeGreaterThanOrEqual(1);
    for (const e of deleted)
      expect(
        rows.some((c) => c.id === (e.payload as { commentId?: string }).commentId),
      ).toBe(false);
  });

  it("sprints: completed ones have their release events, one active sprint holds issues in all three columns", async () => {
    // Catches: a velocity chart with no data (it reads the sprint_removed events), and an empty or one-column active sprint.
    await seedDemo();
    const owner = await demoSession();
    const web = (await db.select().from(projects).where(eq(projects.key, "WEB")))[0]!;
    const rows = await db.select().from(sprints).where(eq(sprints.projectId, web.id));
    expect(rows.map((s) => s.status).sort()).toEqual([
      "active",
      "completed",
      "completed",
      "completed",
      "completed",
      "planned",
    ]);

    const activeId = rows.find((s) => s.status === "active")!.id;
    const inActive = await db
      .select({ status: issues.status })
      .from(issues)
      .where(eq(issues.sprintId, activeId));
    expect(new Set(inActive.map((i) => i.status))).toEqual(
      new Set(["todo", "in_progress", "done"]),
    );

    const released = await db
      .select()
      .from(issueEvents)
      .where(eq(issueEvents.type, "issue.sprint_removed"));
    expect(released.length).toBeGreaterThan(10);

    const velocity = await request(app)
      .get(
        `/api/v1/organizations/${owner.organizationId}/projects/${web.id}/analytics/velocity`,
      )
      .set(owner.auth)
      .expect(200);
    expect((velocity.body.data as { completed: number }[]).length).toBe(4);
    expect(
      (velocity.body.data as { completed: number }[]).every((s) => s.completed > 0),
    ).toBe(true);
  });

  it("the analytics endpoints return real numbers for every project", async () => {
    // Catches: charts that render empty because the history events do not form a valid in_progress -> done replay.
    await seedDemo();
    const owner = await demoSession();
    for (const project of await db.select().from(projects)) {
      const base = `/api/v1/organizations/${owner.organizationId}/projects/${project.id}/analytics`;
      const throughput = await request(app)
        .get(`${base}/throughput`)
        .set(owner.auth)
        .expect(200);
      expect(
        (throughput.body.data as { completed: number }[]).reduce(
          (sum, w) => sum + w.completed,
          0,
        ),
        `${project.key} throughput`,
      ).toBeGreaterThan(5);
      const cycle = await request(app)
        .get(`${base}/cycle-time`)
        .set(owner.auth)
        .expect(200);
      expect(cycle.body.summary.completed, `${project.key} cycle`).toBeGreaterThan(5);
      expect(cycle.body.summary.medianDays).not.toBeNull();
      const breakdown = await request(app)
        .get(`${base}/breakdown`)
        .set(owner.auth)
        .expect(200);
      expect(breakdown.body.total).toBeGreaterThan(15);
      expect(breakdown.body.byLabel.length).toBeGreaterThan(2);
    }
  });

  it("the list filters each find something: overdue, assigned to a person, a priority, and search finds the pricing page", async () => {
    // Catches: demo data too uniform to try the filters on (no overdue issue, nobody assigned), and a search column that did not fill on direct insert.
    await seedDemo();
    const owner = await demoSession();
    const web = (await db.select().from(projects).where(eq(projects.key, "WEB")))[0]!;
    const base = `/api/v1/organizations/${owner.organizationId}/projects/${web.id}/issues`;
    const today = new Date().toISOString().slice(0, 10);

    const overdue = await request(app)
      .get(`${base}?due=overdue&today=${today}`)
      .set(owner.auth)
      .expect(200);
    expect((overdue.body.data as unknown[]).length).toBeGreaterThanOrEqual(2);
    const marcus = (
      await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, PEOPLE.marcus.email))
    )[0]!;
    const assigned = await request(app)
      .get(`${base}?assignee=${marcus.id}`)
      .set(owner.auth)
      .expect(200);
    expect((assigned.body.data as unknown[]).length).toBeGreaterThanOrEqual(3);
    const urgent = await request(app)
      .get(`${base}?priority=urgent`)
      .set(owner.auth)
      .expect(200);
    expect((urgent.body.data as unknown[]).length).toBeGreaterThanOrEqual(1);

    const found = await request(app)
      .get(`/api/v1/organizations/${owner.organizationId}/search?q=pricing`)
      .set(owner.auth)
      .expect(200);
    expect(JSON.stringify(found.body)).toContain("Redesign the pricing page");
  });

  it("two invitations are waiting and the audit log has history", async () => {
    // Catches: an empty Members "pending invitations" list and an empty audit log page.
    await seedDemo();
    const pending = await db.select().from(invitations);
    expect(pending.length).toBe(2);
    expect(
      pending.every(
        (i) =>
          i.acceptedAt === null &&
          i.revokedAt === null &&
          i.expiresAt.getTime() > Date.now(),
      ),
    ).toBe(true);
    const audit = await db.select().from(auditEvents);
    expect(audit.length).toBeGreaterThanOrEqual(12);
  });

  it("running it again changes nothing; --reset rebuilds it with the same shape", async () => {
    // Catches: a second run that doubles the data, and a reset that leaves old rows or users behind (or cannot log in afterwards).
    await seedDemo();
    const before = await db.select({ c: sql<number>`count(*)::int` }).from(issues);
    const again = await seedDemo();
    expect(again.created).toBe(false);
    expect((await db.select({ c: sql<number>`count(*)::int` }).from(issues))[0]!.c).toBe(
      before[0]!.c,
    );

    const rebuilt = await seedDemo({ reset: true });
    expect(rebuilt.created).toBe(true);
    expect((await db.select({ c: sql<number>`count(*)::int` }).from(issues))[0]!.c).toBe(
      before[0]!.c,
    );
    expect(
      (
        await db
          .select({ c: sql<number>`count(*)::int` })
          .from(organizations)
          .where(eq(organizations.slug, DEMO_ORG_SLUG))
      )[0]!.c,
    ).toBe(1);
    expect(
      (
        await db
          .select({ c: sql<number>`count(*)::int` })
          .from(users)
          .where(and(eq(users.email, PEOPLE.alex.email)))
      )[0]!.c,
    ).toBe(1);
    await login(PEOPLE.alex.email).expect(200);
  });

  it("refuses to run in production unless explicitly allowed", async () => {
    // Catches: a reset script that could delete an organization by name on a real database.
    const before = process.env.NODE_ENV;
    const allow = process.env.ALLOW_DEMO_SEED;
    try {
      process.env.NODE_ENV = "production";
      delete process.env.ALLOW_DEMO_SEED;
      await expect(seedDemo()).rejects.toThrow(/production/);
    } finally {
      process.env.NODE_ENV = before;
      if (allow === undefined) delete process.env.ALLOW_DEMO_SEED;
      else process.env.ALLOW_DEMO_SEED = allow;
    }
  });
});
