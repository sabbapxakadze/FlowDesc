import { and, eq, isNull, max, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { attachments, issueEvents, issues, projects, sprints } from "../../db/schema/index.js";
import * as auditRepository from "../audit/audit.repository.js";

/**
 * Drizzle queries only — no business logic here (see CLAUDE.md's layering
 * convention). Every function that reads tenant data takes organizationId
 * and filters on it in the query itself; that is not optional, even though
 * there is only one caller today (see ADR 0004 — defense in depth means
 * this stays true even before auth exists to enforce it a second way).
 */
export async function listByOrganization(organizationId: string) {
  return db.select().from(projects).where(eq(projects.organizationId, organizationId));
}

/** Creates the project and its audit row (project.created) in one transaction. */
export async function create(input: { organizationId: string; name: string; key: string; actorId: string }) {
  const { actorId, ...values } = input;
  return db.transaction(async (tx) => {
    const [project] = await tx.insert(projects).values(values).returning();
    if (!project) throw new Error("Failed to create project");
    await auditRepository.record(tx, {
      organizationId: input.organizationId,
      actorId,
      action: "project.created",
      targetType: "project",
      targetId: project.id,
      targetLabel: project.name,
      details: { key: project.key },
    });
    return project;
  });
}

/**
 * Scoped by organizationId even though a project's id alone would already
 * find the right row — same defense-in-depth reasoning as every other
 * tenant-scoped query (ADR 0004). Used by requireProject to confirm a
 * :projectId route param actually belongs to the caller's organization.
 */
export async function findById(organizationId: string, projectId: string) {
  const [project] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.organizationId, organizationId), eq(projects.id, projectId)));
  return project;
}

/**
 * Name only; scoped by organization. Undefined = no such project in this organization. Writes
 * project.renamed (with the old and new name) in the same transaction, unless the name did not
 * actually change.
 */
export async function updateName(organizationId: string, projectId: string, name: string, actorId: string) {
  return db.transaction(async (tx) => {
    const scope = and(eq(projects.organizationId, organizationId), eq(projects.id, projectId));
    const [before] = await tx.select({ name: projects.name }).from(projects).where(scope);
    if (!before) return undefined;
    const [project] = await tx
      .update(projects)
      .set({ name, updatedAt: new Date() })
      .where(scope)
      .returning();
    if (project && before.name !== name) {
      await auditRepository.record(tx, {
        organizationId,
        actorId,
        action: "project.renamed",
        targetType: "project",
        targetId: projectId,
        targetLabel: name,
        details: { from: before.name, to: name },
      });
    }
    return project;
  });
}

/**
 * Hard-deletes a project (ADR 0022). Everything under it goes by ON DELETE
 * CASCADE: issues and, through them, events, comments, attachment rows,
 * issue-labels and notifications; plus the project's sprints. The cascade cannot
 * delete the uploaded FILES, so their storage keys are returned for the service
 * to remove after the commit, together with who had notifications for any of the
 * project's issues (so their bells can refetch). One transaction; scoped by
 * organization in the query itself.
 */
export async function remove(input: { organizationId: string; projectId: string; actorId: string }): Promise<
  { status: "deleted"; storageKeys: string[]; affectedUserIds: string[] } | { status: "not_found" }
> {
  return db.transaction(async (tx) => {
    const scope = and(eq(projects.organizationId, input.organizationId), eq(projects.id, input.projectId));
    const [project] = await tx
      .select({ id: projects.id, name: projects.name, key: projects.key })
      .from(projects)
      .where(scope);
    if (!project) return { status: "not_found" };

    const inProject = and(eq(issues.organizationId, input.organizationId), eq(issues.projectId, input.projectId));
    const issueFiles = await tx
      .select({ storageKey: attachments.storageKey })
      .from(attachments)
      .innerJoin(issues, eq(attachments.issueId, issues.id))
      .where(inProject);
    // Draft pictures pasted into the New issue popup that no issue owns yet (ADR 0063) go with the project too.
    const draftFiles = await tx
      .select({ storageKey: attachments.storageKey })
      .from(attachments)
      .where(and(eq(attachments.projectId, input.projectId), isNull(attachments.issueId)));
    const files = [...issueFiles, ...draftFiles];
    const actors = await tx
      .selectDistinct({ userId: issueEvents.actorId })
      .from(issueEvents)
      .innerJoin(issues, eq(issueEvents.issueId, issues.id))
      .where(inProject);
    const assignees = await tx.selectDistinct({ userId: issues.assigneeId }).from(issues).where(inProject);

    // Recorded BEFORE the delete, with the name and size at this moment: the project, its issues
    // and their history are all gone a statement later, and this row is what remains.
    const [{ issueCount } = { issueCount: 0 }] = await tx
      .select({ issueCount: sql<number>`count(*)::int` })
      .from(issues)
      .where(inProject);
    await auditRepository.record(tx, {
      organizationId: input.organizationId,
      actorId: input.actorId,
      action: "project.deleted",
      targetType: "project",
      targetId: project.id,
      targetLabel: project.name,
      details: { key: project.key, issueCount },
    });

    await tx.delete(projects).where(scope);

    const affected = new Set<string>(actors.map((row) => row.userId));
    for (const row of assignees) if (row.userId) affected.add(row.userId);
    return {
      status: "deleted",
      storageKeys: files.map((file) => file.storageKey),
      affectedUserIds: [...affected],
    };
  });
}

/**
 * The numbers behind the Projects page: for every project of the organization, its issue counts by state and the latest change, in one grouped query
 * (a project with no issues still comes back, with zeros: it is the LEFT side of the join). Scoped through the project's organization; issues belong to a
 * project, so nothing of another organization can be counted. "Overdue" is a due day before `today` on an issue that is not done.
 */
export async function summarizeByOrganization(organizationId: string, today: string) {
  return db
    .select({
      projectId: projects.id,
      open: sql<number>`count(${issues.id}) filter (where ${issues.status} <> 'done')`.mapWith(Number),
      inProgress: sql<number>`count(${issues.id}) filter (where ${issues.status} = 'in_progress')`.mapWith(Number),
      overdue: sql<number>`count(${issues.id}) filter (where ${issues.status} <> 'done' and ${issues.dueDate} < ${today})`.mapWith(Number),
      done: sql<number>`count(${issues.id}) filter (where ${issues.status} = 'done')`.mapWith(Number),
      total: sql<number>`count(${issues.id})`.mapWith(Number),
      lastChangeAt: max(issues.updatedAt),
    })
    .from(projects)
    .leftJoin(issues, eq(issues.projectId, projects.id))
    .where(eq(projects.organizationId, organizationId))
    .groupBy(projects.id);
}

/** The running sprint of each project that has one (the database allows at most one per project, ADR 0008). */
export async function listActiveSprints(organizationId: string) {
  return db
    .select({ projectId: sprints.projectId, name: sprints.name, endDate: sprints.endDate })
    .from(sprints)
    .where(and(eq(sprints.organizationId, organizationId), eq(sprints.status, "active")));
}
