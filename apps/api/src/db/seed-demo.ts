import { createHash, randomBytes, randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import argon2 from "argon2";
import { eq, inArray } from "drizzle-orm";
import { mentionToken } from "@flowdesc/contracts";
import { db, pool } from "./client.js";
import {
  auditEvents,
  comments,
  invitations,
  issueEvents,
  issueLabels,
  issues,
  labels,
  notifications,
  organizationMembers,
  organizations,
  projects,
  sprints,
  users,
} from "./schema/index.js";
import {
  AUDIT,
  DEMO_ORG_NAME,
  DEMO_ORG_SLUG,
  DEMO_PASSWORD,
  LABELS,
  PEOPLE,
  PENDING_INVITATIONS,
  PROJECTS,
  type CommentSpec,
  type LabelName,
  type PersonKey,
  type Priority,
  type ProjectSpec,
  type Status,
} from "./seed-demo-data.js";

/**
 * The demo organization (ADR 0039): "FlowDesc Demo", five people (one per role, all with the password `Demo123!@#`),
 * three projects with about 60 issues, sprints with history, comments with @mentions, notifications for the demo owner,
 * pending invitations and an audit log. Log in as `demo@flowdesc.test`.
 *
 * - `pnpm db:seed:demo` builds it when it is not there yet and does nothing when it is; `--reset` deletes it and the five
 *   demo users and builds it again (the way to undo whatever a visitor changed, and to refresh the dates).
 * - Like the analytics seed it inserts rows directly with explicit, backdated timestamps (the real repositories stamp now()
 *   and fan out notifications), but the rows mirror what the real code writes: issue numbers and ranks, an event for every
 *   change an issue's state implies, sprint events like complete() writes them, comments with their events.
 * - Everything is relative to the moment it runs, so "overdue" and "due this week" are true whenever it is rebuilt.
 * - It refuses to run in production unless ALLOW_DEMO_SEED=true: a script that deletes an organization by name must not be
 *   pointed at real data by accident.
 * - The same builder makes the private copies of "Try the demo" (ADR 0044): `createDemoCopy` gives the five people emails with a random
 *   suffix, no password at all (nobody can log in to a copy by guessing) and an expiry time, so the organization can be deleted later.
 */

const DAY = 86_400_000;
const HOUR = 3_600_000;
const PERSON_KEYS = Object.keys(PEOPLE) as PersonKey[];

export interface DemoSeedResult {
  created: boolean;
  people: number;
  projects: number;
  issues: number;
  comments: number;
  events: number;
  notifications: number;
}

interface SprintRow {
  id: string;
  name: string;
  status: "completed" | "active" | "planned";
  startAgo?: number;
  endAgo?: number;
}

interface Draft {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: Status;
  priority: Priority;
  labels: LabelName[];
  assignee?: PersonKey;
  reporter: PersonKey;
  dueIn?: number;
  createdAgo: number;
  startedAgo?: number;
  doneAgo?: number;
  openSprint?: SprintRow;
  pastSprints: SprintRow[];
  comments: CommentSpec[];
}

async function resetDemo(): Promise<void> {
  const org = await db.query.organizations.findFirst({
    where: eq(organizations.slug, DEMO_ORG_SLUG),
  });
  // Deleting the organization removes its projects, issues, events, comments, notifications, labels, members, invitations and audit rows.
  if (org) await db.delete(organizations).where(eq(organizations.id, org.id));
  await db.delete(users).where(
    inArray(
      users.email,
      PERSON_KEYS.map((key) => PEOPLE[key].email),
    ),
  );
}

function expandMentions(
  text: string,
  ids: Record<PersonKey, string>,
): { body: string; mentioned: string[] } {
  const mentioned: string[] = [];
  const body = text.replace(
    /\{(alex|nino|marcus|sofia|daniel)\}/g,
    (_, key: PersonKey) => {
      if (!mentioned.includes(ids[key])) mentioned.push(ids[key]);
      return mentionToken(ids[key], PEOPLE[key].name);
    },
  );
  return { body, mentioned };
}

/** Who a build of the demo is made of: the part that differs between the development demo and a visitor's private copy. */
interface DemoIdentity {
  emailOf: (key: PersonKey) => string;
  orgSlug: string;
  /** Null: nobody can log in with a password (a visitor's copy is entered through a session the server issues). */
  passwordHash: string | null;
  /** When the organization is to be deleted (a visitor's copy); null for the development demo, which stays. */
  demoExpiresAt: Date | null;
}

export async function seedDemo(
  options: { reset?: boolean } = {},
): Promise<DemoSeedResult> {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
    throw new Error(
      "Refusing to seed the demo organization in production (set ALLOW_DEMO_SEED=true to override).",
    );
  }
  if (options.reset) await resetDemo();

  const existing = await db.query.organizations.findFirst({
    where: eq(organizations.slug, DEMO_ORG_SLUG),
  });
  if (existing) {
    return {
      created: false,
      people: 0,
      projects: 0,
      issues: 0,
      comments: 0,
      events: 0,
      notifications: 0,
    };
  }

  const passwordHash = await argon2.hash(DEMO_PASSWORD, { type: argon2.argon2id });
  return buildDemoOrganization({
    emailOf: (key) => PEOPLE[key].email,
    orgSlug: DEMO_ORG_SLUG,
    passwordHash,
    demoExpiresAt: null,
  });
}

/**
 * A private copy of the demo for one visitor (ADR 0044): the same data as the development demo, under emails and a slug with a random
 * suffix, with no password and an expiry. Returns the organization and the owner (the person the visitor will be signed in as).
 */
export async function createDemoCopy(
  demoExpiresAt: Date,
): Promise<{ organizationId: string; ownerId: string }> {
  const suffix = randomBytes(4).toString("hex");
  const { organizationId, ownerId } = await buildDemoOrganization({
    emailOf: (key) => `${key}.${suffix}@demo.flowdesc.test`,
    orgSlug: `demo-${suffix}`,
    passwordHash: null,
    demoExpiresAt,
  });
  return { organizationId, ownerId };
}

async function buildDemoOrganization(
  identity: DemoIdentity,
): Promise<DemoSeedResult & { organizationId: string; ownerId: string }> {
  const now = Date.now();
  const ago = (days: number) => new Date(now - days * DAY);
  const dateOnly = (daysFromToday: number) =>
    new Date(now + daysFromToday * DAY).toISOString().slice(0, 10);

  return db.transaction(async (tx) => {
    // ---- people, organization, membership ---------------------------------------------------------------
    const joinedAgo: Record<PersonKey, number> = {
      alex: 90,
      nino: 58,
      marcus: 50,
      sofia: 45,
      daniel: 40,
    };
    const ids = {} as Record<PersonKey, string>;
    for (const key of PERSON_KEYS) {
      const person = PEOPLE[key];
      const [row] = await tx
        .insert(users)
        .values({
          email: identity.emailOf(key),
          passwordHash: identity.passwordHash,
          name: person.name,
          jobTitle: person.jobTitle,
          bio: person.bio,
          // No saved timezone: every time shows in the viewer's own zone (the browser's), not in a made-up one.
          emailVerifiedAt: ago(joinedAgo[key]),
          profileNudgeDismissedAt: ago(joinedAgo[key] - 1),
          tourSeenAt: ago(joinedAgo[key] - 1), // the demo starts its own tour; nobody in it should get a second one
          createdAt: ago(joinedAgo[key]),
        })
        // A user from an earlier, partial run: make sure the login works and the profile is the demo one.
        .onConflictDoUpdate({
          target: users.email,
          set: {
            passwordHash: identity.passwordHash,
            name: person.name,
            jobTitle: person.jobTitle,
            bio: person.bio,
            timezone: null, // back to "the browser's" on a re-run of the seed
            emailVerifiedAt: ago(joinedAgo[key]),
          },
        })
        .returning({ id: users.id });
      ids[key] = row!.id;
    }

    const [org] = await tx
      .insert(organizations)
      .values({
        name: DEMO_ORG_NAME,
        slug: identity.orgSlug,
        demoExpiresAt: identity.demoExpiresAt,
        createdAt: ago(90),
      })
      .returning({ id: organizations.id });
    const organizationId = org!.id;
    await tx.insert(organizationMembers).values(
      PERSON_KEYS.map((key) => ({
        organizationId,
        userId: ids[key],
        role: PEOPLE[key].role,
        createdAt: ago(joinedAgo[key]),
      })),
    );

    // ---- labels ------------------------------------------------------------------------------------------
    const labelNames = Object.keys(LABELS) as LabelName[];
    const labelRows = await tx
      .insert(labels)
      .values(
        labelNames.map((name) => ({
          organizationId,
          name,
          color: LABELS[name],
          createdAt: ago(88),
        })),
      )
      .returning({ id: labels.id, name: labels.name });
    const labelId = (name: LabelName) => labelRows.find((l) => l.name === name)!.id;

    // ---- projects and sprints ----------------------------------------------------------------------------
    const projectIds = new Map<string, string>();
    const projectCreatedAgo: Record<string, number> = { WEB: 84, APP: 70, API: 60 };
    const sprintRows = new Map<string, SprintRow[]>(); // by project key, in the order of the spec
    const sprintInserts: (typeof sprints.$inferInsert)[] = [];
    for (const project of PROJECTS) {
      const [row] = await tx
        .insert(projects)
        .values({
          organizationId,
          name: project.name,
          key: project.key,
          createdAt: ago(projectCreatedAgo[project.key] ?? 60),
        })
        .returning({ id: projects.id });
      projectIds.set(project.key, row!.id);
      const rows: SprintRow[] = project.sprints.map((s) => ({
        id: randomUUID(),
        name: s.name,
        status: s.status,
        startAgo: s.startAgo,
        endAgo: s.endAgo,
      }));
      sprintRows.set(project.key, rows);
      for (const s of rows) {
        sprintInserts.push({
          id: s.id,
          organizationId,
          projectId: row!.id,
          name: s.name,
          status: s.status,
          startDate: s.startAgo === undefined ? null : dateOnly(-s.startAgo),
          endDate: s.endAgo === undefined ? null : dateOnly(-s.endAgo),
          version: s.status === "completed" ? 3 : s.status === "active" ? 2 : 1,
          createdAt: ago((s.startAgo ?? 3) + 1),
          updatedAt: ago(s.status === "completed" ? s.endAgo! : (s.startAgo ?? 3)),
        });
      }
    }
    await tx.insert(sprints).values(sprintInserts);

    // ---- issues ------------------------------------------------------------------------------------------
    const drafts: Draft[] = [];
    for (const project of PROJECTS) {
      drafts.push(
        ...draftsFor(project, projectIds.get(project.key)!, sprintRows.get(project.key)!),
      );
    }

    const issueRows: (typeof issues.$inferInsert)[] = [];
    const labelRowsOut: (typeof issueLabels.$inferInsert)[] = [];
    const eventRows: (typeof issueEvents.$inferInsert & {
      id: string;
      createdAt: Date;
    })[] = [];
    const commentRows: (typeof comments.$inferInsert)[] = [];
    const lastTouched = new Map<string, number>();
    const issueMeta = new Map<string, { assignee?: PersonKey; reporter: PersonKey }>();

    const addEvent = (
      issueId: string,
      actor: PersonKey,
      type: string,
      payload: Record<string, unknown>,
      at: Date,
    ) => {
      const when = Math.min(at.getTime(), now - 60_000);
      const row = {
        id: randomUUID(),
        issueId,
        actorId: ids[actor],
        type,
        payload,
        createdAt: new Date(when),
      };
      eventRows.push(row);
      lastTouched.set(issueId, Math.max(lastTouched.get(issueId) ?? 0, when));
      return row;
    };

    for (const project of PROJECTS) {
      const projectDrafts = drafts
        .filter((d) => d.projectId === projectIds.get(project.key))
        .sort((a, b) => b.createdAgo - a.createdAgo); // oldest first: that is the order of the issue numbers
      const numberOf = new Map(projectDrafts.map((d, i) => [d.id, i + 1]));

      const boardRank = new Map<string, string>();
      for (const status of ["todo", "in_progress", "done"] as Status[]) {
        projectDrafts
          .filter((d) => d.status === status)
          .forEach((d, i) => boardRank.set(d.id, String((i + 1) * 1000)));
      }
      // Backlog (and sprint) order: newest first, within each sprint or the backlog itself.
      const backlogRank = new Map<string, string>();
      const groups = new Map<string, Draft[]>();
      for (const d of projectDrafts) {
        const g = d.openSprint?.id ?? "backlog";
        groups.set(g, [...(groups.get(g) ?? []), d]);
      }
      for (const group of groups.values()) {
        [...group]
          .reverse()
          .forEach((d, i) => backlogRank.set(d.id, String((i + 1) * 1000)));
      }

      for (const d of projectDrafts) {
        const createdAt = ago(d.createdAgo);
        const actor = d.assignee ?? d.reporter;
        const fromCreated = (hours: number) =>
          new Date(createdAt.getTime() + hours * HOUR);
        issueMeta.set(d.id, { assignee: d.assignee, reporter: d.reporter });

        addEvent(d.id, d.reporter, "issue.created", { title: d.title }, createdAt);
        d.labels.forEach((name, i) => {
          addEvent(
            d.id,
            d.reporter,
            "issue.label_added",
            { labelId: labelId(name), labelName: name },
            fromCreated(0.1 + i * 0.05),
          );
          labelRowsOut.push({ issueId: d.id, labelId: labelId(name) });
        });
        if (d.priority !== "none")
          addEvent(
            d.id,
            d.reporter,
            "issue.updated",
            { priority: d.priority },
            fromCreated(1),
          );
        if (d.assignee)
          addEvent(
            d.id,
            d.reporter,
            "issue.updated",
            { assigneeId: ids[d.assignee], assigneeName: PEOPLE[d.assignee].name },
            fromCreated(2),
          );
        if (d.dueIn !== undefined)
          addEvent(
            d.id,
            d.reporter,
            "issue.updated",
            { dueDate: dateOnly(d.dueIn) },
            fromCreated(3),
          );

        // Every edit, move and sprint change raised the issue's version, as the real update path does.
        let versionBumps = eventRows.filter(
          (e) => e.issueId === d.id && e.type === "issue.updated",
        ).length;
        const bump = () => (versionBumps += 1);

        if (d.startedAgo !== undefined) {
          addEvent(
            d.id,
            actor,
            "issue.moved",
            { fromStatus: "todo", toStatus: "in_progress" },
            ago(d.startedAgo),
          );
          bump();
        }
        if (d.doneAgo !== undefined) {
          addEvent(
            d.id,
            actor,
            "issue.moved",
            { fromStatus: "in_progress", toStatus: "done" },
            ago(d.doneAgo),
          );
          bump();
        }

        for (const sprint of d.pastSprints) {
          const joined =
            d.createdAgo > sprint.startAgo!
              ? ago(sprint.startAgo! - 0.05)
              : fromCreated(3);
          addEvent(
            d.id,
            "alex",
            "issue.sprint_assigned",
            { sprintId: sprint.id, sprintName: sprint.name },
            joined,
          );
          addEvent(
            d.id,
            "alex",
            "issue.sprint_removed",
            { sprintId: sprint.id, sprintName: sprint.name, reason: "sprint_completed" },
            ago(sprint.endAgo!),
          );
          bump();
          bump();
        }
        if (d.openSprint) {
          const start =
            d.openSprint.startAgo !== undefined && d.createdAgo > d.openSprint.startAgo
              ? ago(d.openSprint.startAgo - 0.05)
              : fromCreated(4);
          addEvent(
            d.id,
            "alex",
            "issue.sprint_assigned",
            { sprintId: d.openSprint.id, sprintName: d.openSprint.name },
            start,
          );
          bump();
        }

        for (const c of d.comments) {
          if (c.agoDays >= d.createdAgo)
            throw new Error(
              `Demo data: a comment on "${d.title}" is older than the issue.`,
            );
          const { body, mentioned } = expandMentions(c.text, ids);
          const commentId = randomUUID();
          const at = ago(c.agoDays);
          const commentedMentions = mentioned.filter((id) => id !== ids[c.by]);
          addEvent(
            d.id,
            c.by,
            "issue.commented",
            { commentId, body, mentions: commentedMentions },
            at,
          );
          if (c.deleted) {
            addEvent(
              d.id,
              c.by,
              "issue.comment_deleted",
              { commentId },
              new Date(at.getTime() + 20 * 60_000),
            );
            continue;
          }
          let finalBody = body;
          let updatedAt = at;
          if (c.edited) {
            finalBody = expandMentions(c.edited, ids).body;
            updatedAt = new Date(at.getTime() + 2 * HOUR);
            addEvent(
              d.id,
              c.by,
              "issue.comment_edited",
              { commentId, body: finalBody, mentions: [] },
              updatedAt,
            );
          }
          commentRows.push({
            id: commentId,
            issueId: d.id,
            authorId: ids[c.by],
            body: finalBody,
            createdAt: at,
            updatedAt,
          });
        }

        issueRows.push({
          id: d.id,
          organizationId,
          projectId: d.projectId,
          number: numberOf.get(d.id)!,
          title: d.title,
          description: d.description,
          status: d.status,
          priority: d.priority,
          dueDate: d.dueIn === undefined ? null : dateOnly(d.dueIn),
          assigneeId: d.assignee ? ids[d.assignee] : null,
          reporterId: ids[d.reporter],
          version: 1 + versionBumps,
          boardRank: boardRank.get(d.id)!,
          backlogRank: backlogRank.get(d.id)!,
          sprintId: d.openSprint?.id ?? null,
          createdAt,
          updatedAt: new Date(lastTouched.get(d.id) ?? createdAt.getTime()),
        });
      }
      await tx
        .update(projects)
        .set({ nextIssueNumber: projectDrafts.length + 1 })
        .where(eq(projects.id, projectIds.get(project.key)!));
    }

    await tx.insert(issues).values(issueRows);
    await tx.insert(issueLabels).values(labelRowsOut);
    for (let i = 0; i < eventRows.length; i += 500)
      await tx.insert(issueEvents).values(eventRows.slice(i, i + 500));
    if (commentRows.length > 0) await tx.insert(comments).values(commentRows);

    // ---- notifications for the demo owner: what a real week would have sent them ------------------------
    const alex = ids.alex;
    const candidates = eventRows
      .filter((e) => {
        if (e.actorId === alex) return false;
        const payload = e.payload as { assigneeId?: string; mentions?: string[] };
        const meta = issueMeta.get(e.issueId)!;
        if (e.type === "issue.updated") return payload.assigneeId === alex;
        if (e.type === "issue.commented")
          return (
            Boolean(payload.mentions?.includes(alex)) ||
            meta.assignee === "alex" ||
            meta.reporter === "alex"
          );
        return false;
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 9);
    const notificationRows = candidates.map((e, i) => ({
      userId: alex,
      issueEventId: e.id,
      createdAt: e.createdAt,
      // The five most recent are unread; the older ones were read a few hours after they arrived.
      readAt:
        i < 5 ? null : new Date(Math.min(e.createdAt.getTime() + 3 * HOUR, now - 60_000)),
    }));
    if (notificationRows.length > 0)
      await tx.insert(notifications).values(notificationRows);

    // ---- invitations and the audit log -------------------------------------------------------------------
    await tx.insert(invitations).values(
      PENDING_INVITATIONS.map((p) => ({
        organizationId,
        email: p.email,
        role: p.role,
        tokenHash: createHash("sha256").update(randomBytes(32)).digest("hex"),
        invitedBy: alex,
        expiresAt: new Date(ago(p.agoDays).getTime() + 7 * DAY),
        createdAt: ago(p.agoDays),
      })),
    );
    await tx.insert(auditEvents).values(
      AUDIT.map((a) => ({
        organizationId,
        actorId: ids[a.by],
        actorName: PEOPLE[a.by].name,
        action: a.action,
        targetType: a.targetType,
        targetLabel: a.target,
        details: a.details,
        createdAt: ago(a.agoDays),
      })),
    );

    return {
      created: true,
      people: PERSON_KEYS.length,
      projects: PROJECTS.length,
      issues: issueRows.length,
      comments: commentRows.length,
      events: eventRows.length,
      notifications: notificationRows.length,
      organizationId,
      ownerId: alex,
    };
  });
}

/** One project's issues: the hand-written current ones, and the finished history of its completed sprints. */
function draftsFor(
  project: ProjectSpec,
  projectId: string,
  sprintRows: SprintRow[],
): Draft[] {
  const out: Draft[] = [];
  const active = sprintRows.find((s) => s.status === "active");
  const planned = sprintRows.find((s) => s.status === "planned");

  for (const spec of project.current) {
    if (spec.status === "done" && spec.doneAgo === undefined)
      throw new Error(`Demo data: "${spec.title}" is done but has no doneAgo.`);
    let startedAgo: number | undefined;
    if (spec.status === "in_progress") startedAgo = Math.max(0.3, spec.createdAgo * 0.5);
    if (spec.status === "done") {
      if (spec.createdAgo <= spec.doneAgo!)
        throw new Error(`Demo data: "${spec.title}" was finished before it was created.`);
      startedAgo = spec.doneAgo! + (spec.createdAgo - spec.doneAgo!) * 0.5;
    }
    const openSprint =
      spec.sprint === "active" ? active : spec.sprint === "planned" ? planned : undefined;
    if (spec.sprint && !openSprint)
      throw new Error(
        `Demo data: "${spec.title}" names a ${spec.sprint} sprint the project does not have.`,
      );
    out.push({
      id: randomUUID(),
      projectId,
      title: spec.title,
      description: spec.description ?? null,
      status: spec.status,
      priority: spec.priority ?? "none",
      labels: spec.labels ?? [],
      assignee: spec.assignee,
      reporter: spec.reporter ?? "alex",
      dueIn: spec.dueIn,
      createdAgo: spec.createdAgo,
      startedAgo,
      doneAgo: spec.doneAgo,
      openSprint,
      pastSprints: [],
      comments: spec.comments ?? [],
    });
  }

  const completed = sprintRows.filter((s) => s.status === "completed");
  project.history.forEach((h, i) => {
    const sprint = completed[i % completed.length]!;
    // One issue per project with two completed sprints runs over: it is in the first when that closes, unfinished, and done in the second.
    const carry = completed.length > 1 && i === 2;
    const finishIn = carry ? completed[1]! : sprint;
    // Finished somewhere inside the sprint (spread over its length, so the weekly charts have a believable rhythm), after 1.5 to 5.4 days of work.
    const doneAgo = finishIn.endAgo! + 0.5 + ((i * 5) % 12);
    const startedAgo = Math.min(finishIn.startAgo! - 0.4, doneAgo + 1.5 + (i % 4) * 1.3);
    const first = carry ? completed[0]! : sprint;
    out.push({
      id: randomUUID(),
      projectId,
      title: h.title,
      description: null,
      status: "done",
      priority: h.priority ?? "none",
      labels: h.labels ?? [],
      assignee: h.assignee,
      reporter: i % 2 === 0 ? "nino" : "alex",
      createdAgo: first.startAgo! + 1 + (i % 4),
      startedAgo,
      doneAgo,
      pastSprints: carry ? [completed[0]!, completed[1]!] : [sprint],
      comments: [],
    });
  });
  return out;
}

const entry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === entry) {
  seedDemo({ reset: process.argv.includes("--reset") })
    .then((result) => {
      if (!result.created) {
        console.log(
          `The demo organization already exists. Run with --reset to rebuild it. Log in as demo@flowdesc.test.`,
        );
      } else {
        console.log(
          `Built "${DEMO_ORG_NAME}": ${result.people} people, ${result.projects} projects, ${result.issues} issues, ${result.comments} comments, ${result.events} events, ${result.notifications} notifications for the owner.`,
        );
        console.log(`Log in as demo@flowdesc.test with the password ${DEMO_PASSWORD}`);
      }
    })
    .catch((err: unknown) => {
      console.error("Demo seed failed:", err);
      process.exitCode = 1;
    })
    .finally(() => {
      void pool.end();
    });
}
