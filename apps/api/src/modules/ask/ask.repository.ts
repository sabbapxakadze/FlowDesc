import { and, asc, count, desc, eq, gte, inArray, isNull, lt, lte, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "../../db/client.js";
import { issues, projects, users } from "../../db/schema/index.js";

/**
 * Every read behind "Ask FlowDesc" retrieval (ADR 0077). EVERY function takes the organization id and filters by it IN THE QUERY, whatever the caller has
 * already checked: the id comes from the person's verified membership, and this is the second layer (ADR 0004). Nothing here writes.
 */

export type IssueCardRow = {
  id: string;
  number: number;
  title: string;
  description: string | null;
  status: "todo" | "in_progress" | "done";
  priority: "none" | "low" | "medium" | "high" | "urgent";
  dueDate: string | null;
  projectKey: string;
  projectName: string;
  assigneeName: string | null;
};

/** The question as a text-search query where ANY word may match (the default `plainto_tsquery` needs ALL of them, which a natural question never satisfies). */
const relaxedQuery = (question: string) => sql`replace(plainto_tsquery('english', ${question})::text, ' & ', ' | ')::tsquery`;

/**
 * Issues whose title or description, or any of whose comments, match the question, best first. A comment hit counts for its issue; an issue's rank is the
 * better of its own and its best comment's. The question only ever reaches Postgres as a bound value.
 */
export async function searchByText(organizationId: string, question: string, limit: number): Promise<string[]> {
  const result = await db.execute<{ issue_id: string }>(sql`
    with q as (select ${relaxedQuery(question)} as q)
    select issue_id
    from (
      select i.id as issue_id, ts_rank(i.search_vector, q.q) as rank
      from issues i, q
      where i.organization_id = ${organizationId} and i.search_vector @@ q.q
      union all
      select c.issue_id, ts_rank(c.search_vector, q.q) as rank
      from comments c
      join issues i on i.id = c.issue_id, q
      where i.organization_id = ${organizationId} and c.search_vector @@ q.q
    ) hits
    group by issue_id
    order by max(rank) desc, issue_id
    limit ${limit}
  `);
  return result.rows.map((row) => row.issue_id);
}

/** The keys of this organization's projects ("WEB", "API"), so a question can name an issue as "web12" or "web 12". Only this organization's projects. */
export async function projectKeys(organizationId: string): Promise<string[]> {
  const rows = await db.select({ key: projects.key }).from(projects).where(eq(projects.organizationId, organizationId)).orderBy(asc(projects.key)).limit(200);
  return rows.map((r) => r.key);
}

/** The ids of the issues named by key ("WEB-12"), in the order asked. A key that names nothing in this organization is simply absent. */
export async function findByKeys(organizationId: string, keys: { projectKey: string; number: number }[]): Promise<{ key: string; id: string }[]> {
  if (keys.length === 0) return [];
  const rows = await db
    .select({ id: issues.id, projectKey: projects.key, number: issues.number })
    .from(issues)
    .innerJoin(projects, eq(projects.id, issues.projectId))
    .where(
      and(
        eq(issues.organizationId, organizationId),
        eq(projects.organizationId, organizationId),
        or(...keys.map((k) => and(sql`upper(${projects.key}) = ${k.projectKey}`, eq(issues.number, k.number)))),
      ),
    );
  const found = new Map(rows.map((r) => [`${r.projectKey.toUpperCase()}-${r.number}`, r.id]));
  return keys.flatMap((k) => {
    const key = `${k.projectKey}-${k.number}`;
    const id = found.get(key);
    return id ? [{ key, id }] : [];
  });
}

export type IdList = { ids: string[]; total: number };

async function idList(where: SQL | undefined, order: SQL[], limit: number): Promise<IdList> {
  const [rows, totals] = await Promise.all([
    db.select({ id: issues.id }).from(issues).where(where).orderBy(...order).limit(limit),
    db.select({ total: count() }).from(issues).where(where),
  ]);
  return { ids: rows.map((r) => r.id), total: totals[0]?.total ?? 0 };
}

/** Not done, and due before `today` (ADR 0032's definition), the longest overdue first. */
export function listOverdue(organizationId: string, today: string, limit: number): Promise<IdList> {
  return idList(and(eq(issues.organizationId, organizationId), lt(issues.dueDate, today), ne(issues.status, "done")), [asc(issues.dueDate), asc(issues.id)], limit);
}

/** Not done, due from `from` to `to` (calendar days, both included), soonest first. */
export function listDueBetween(organizationId: string, from: string, to: string, limit: number): Promise<IdList> {
  return idList(
    and(eq(issues.organizationId, organizationId), gte(issues.dueDate, from), lte(issues.dueDate, to), ne(issues.status, "done")),
    [asc(issues.dueDate), asc(issues.id)],
    limit,
  );
}

/** Open issues assigned to this person, those with a due date first (soonest first), then the most recently changed. */
export function listAssignedTo(organizationId: string, userId: string, limit: number): Promise<IdList> {
  return idList(
    and(eq(issues.organizationId, organizationId), eq(issues.assigneeId, userId), ne(issues.status, "done")),
    [sql`${issues.dueDate} asc nulls last`, desc(issues.updatedAt), asc(issues.id)],
    limit,
  );
}

export function listInProgress(organizationId: string, limit: number): Promise<IdList> {
  return idList(and(eq(issues.organizationId, organizationId), eq(issues.status, "in_progress")), [desc(issues.updatedAt), asc(issues.id)], limit);
}

/** Open issues nobody is assigned to, the most recently changed first. */
export function listUnassigned(organizationId: string, limit: number): Promise<IdList> {
  return idList(and(eq(issues.organizationId, organizationId), isNull(issues.assigneeId), ne(issues.status, "done")), [desc(issues.updatedAt), asc(issues.id)], limit);
}

/** Open issues of priority urgent or high, urgent first, then the soonest due (no due date last). */
export function listUrgent(organizationId: string, limit: number): Promise<IdList> {
  return idList(
    and(eq(issues.organizationId, organizationId), inArray(issues.priority, ["urgent", "high"]), ne(issues.status, "done")),
    [sql`case when ${issues.priority} = 'urgent' then 0 else 1 end`, sql`${issues.dueDate} asc nulls last`, desc(issues.updatedAt), asc(issues.id)],
    limit,
  );
}

/** The issues changed most recently, whatever their status. */
export function listRecent(organizationId: string, limit: number): Promise<IdList> {
  return idList(eq(issues.organizationId, organizationId), [desc(issues.updatedAt), asc(issues.id)], limit);
}

export type PersonLoad = { name: string; open: number };

/** How many open (not done) issues each person has, the most first, and how many open issues have nobody. Only this organization's issues are counted. */
export async function workloadCounts(organizationId: string, limit: number): Promise<{ people: PersonLoad[]; unassigned: number }> {
  const [people, unassigned] = await Promise.all([
    db
      .select({ name: users.name, open: count(issues.id) })
      .from(issues)
      .innerJoin(users, eq(users.id, issues.assigneeId))
      .where(and(eq(issues.organizationId, organizationId), ne(issues.status, "done")))
      .groupBy(users.id, users.name)
      .orderBy(desc(count(issues.id)), asc(users.name))
      .limit(limit),
    db.select({ n: count() }).from(issues).where(and(eq(issues.organizationId, organizationId), isNull(issues.assigneeId), ne(issues.status, "done"))),
  ]);
  return { people: people.map((p) => ({ name: p.name, open: p.open })), unassigned: unassigned[0]?.n ?? 0 };
}

export type Overview = {
  byStatus: Record<"todo" | "in_progress" | "done", number>;
  byPriority: Record<"none" | "low" | "medium" | "high" | "urgent", number>;
  projects: { name: string; key: string; issues: number }[];
};

/** Counts for the whole organization (and only it): issues by status, by priority, and per project. The answer to "what statuses do we have?" and "how many issues?". */
export async function overviewCounts(organizationId: string, maxProjects: number): Promise<Overview> {
  const [statuses, priorities, perProject] = await Promise.all([
    db.select({ value: issues.status, n: count() }).from(issues).where(eq(issues.organizationId, organizationId)).groupBy(issues.status),
    db.select({ value: issues.priority, n: count() }).from(issues).where(eq(issues.organizationId, organizationId)).groupBy(issues.priority),
    db
      .select({ name: projects.name, key: projects.key, n: count(issues.id) })
      .from(projects)
      .leftJoin(issues, and(eq(issues.projectId, projects.id), eq(issues.organizationId, organizationId)))
      .where(eq(projects.organizationId, organizationId))
      .groupBy(projects.id, projects.name, projects.key)
      .orderBy(asc(projects.name))
      .limit(maxProjects),
  ]);
  const byStatus = { todo: 0, in_progress: 0, done: 0 };
  for (const row of statuses) byStatus[row.value] = row.n;
  const byPriority = { none: 0, low: 0, medium: 0, high: 0, urgent: 0 };
  for (const row of priorities) byPriority[row.value] = row.n;
  return { byStatus, byPriority, projects: perProject.map((p) => ({ name: p.name, key: p.key, issues: p.n })) };
}

/** The fields a source needs, for these issue ids and only those that belong to this organization. In no particular order: the caller orders them. */
export async function loadIssueCards(organizationId: string, ids: string[]): Promise<IssueCardRow[]> {
  if (ids.length === 0) return [];
  return db
    .select({
      id: issues.id,
      number: issues.number,
      title: issues.title,
      description: issues.description,
      status: issues.status,
      priority: issues.priority,
      dueDate: issues.dueDate,
      projectKey: projects.key,
      projectName: projects.name,
      assigneeName: users.name,
    })
    .from(issues)
    .innerJoin(projects, eq(projects.id, issues.projectId))
    .leftJoin(users, eq(users.id, issues.assigneeId))
    .where(and(eq(issues.organizationId, organizationId), eq(projects.organizationId, organizationId), inArray(issues.id, ids)));
}

export type CommentRow = { issueId: string; body: string; createdAt: Date; authorName: string };

/**
 * Up to `perIssue` comments of each of these issues: first the ones that match the question (best match first), then the newest. A deleted comment is a
 * deleted row, so it is never here, and the text kept in the history is never read.
 */
export async function loadComments(organizationId: string, ids: string[], question: string, perIssue: number): Promise<CommentRow[]> {
  if (ids.length === 0) return [];
  const result = await db.execute<{ issue_id: string; body: string; created_at: Date; author_name: string }>(sql`
    with q as (select ${relaxedQuery(question)} as q)
    select issue_id, body, created_at, author_name
    from (
      select c.issue_id, c.body, c.created_at, u.name as author_name,
        row_number() over (
          partition by c.issue_id
          order by (c.search_vector @@ q.q) desc, ts_rank(c.search_vector, q.q) desc, c.created_at desc, c.id
        ) as rn
      from comments c
      join issues i on i.id = c.issue_id
      join users u on u.id = c.author_id, q
      where i.organization_id = ${organizationId} and c.issue_id in (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
    ) ranked
    where rn <= ${perIssue}
    order by issue_id, rn
  `);
  return result.rows.map((r) => ({ issueId: r.issue_id, body: r.body, createdAt: new Date(r.created_at), authorName: r.author_name }));
}
