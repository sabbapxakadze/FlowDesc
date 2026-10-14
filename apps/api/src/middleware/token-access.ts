/**
 * The one list of addresses a personal access token may call (ADR 0070, 0074). Everything not on it is refused for a token:
 * everything under /auth, token management itself, account, profile and upload addresses, invitations, the audit log, notifications
 * and every delete. Reading is open to every token on the GET list. Writing is three addresses (create an issue, change an issue,
 * add a comment), and only a token made with write access may call them. A list of what IS allowed, in one file, so the whole reach
 * of a token can be read at a glance and a new route is closed to tokens until someone adds it here on purpose.
 *
 * A token still goes through requireOrgMembership and the role checks like any signed-in person, so being on this list never gives
 * more than its owner can already do.
 */
const ID = "[^/]+";
const ORG = `/api/v1/organizations/${ID}`;
const PROJECT = `${ORG}/projects/${ID}`;

const compile = (patterns: string[]) => patterns.map((pattern) => new RegExp(`^${pattern}$`));

const ALLOWED_GET_PATHS: RegExp[] = compile([
  `/api/v1/users/me/context`,
  `${ORG}/members`,
  `${ORG}/labels`,
  `${ORG}/search`,
  `${ORG}/projects`,
  `${ORG}/projects/summary`,
  `${PROJECT}/issues`,
  `${PROJECT}/issues/by-number/${ID}`,
  `${PROJECT}/issues/${ID}`,
  `${PROJECT}/issues/${ID}/labels`,
  `${PROJECT}/issues/${ID}/events`,
  `${PROJECT}/board`,
  `${PROJECT}/backlog`,
  `${PROJECT}/sprints`,
  `${PROJECT}/analytics/(?:throughput|cycle-time|velocity|breakdown)`,
  `${ORG}/my-work/issues`,
  `${ORG}/my-work/week`,
]);

/**
 * The write addresses (ADR 0074). Each acts on one issue: there is no address here that takes several, which is what keeps "one issue
 * per call" true whatever a client sends. Moving, sprints, labels, files, editing or deleting a comment and deleting an issue are not
 * here, so they stay refused.
 */
const ALLOWED_WRITE_PATHS: { method: string; pattern: RegExp }[] = [
  { method: "POST", pattern: new RegExp(`^${PROJECT}/issues$`) },
  { method: "PATCH", pattern: new RegExp(`^${PROJECT}/issues/${ID}$`) },
  { method: "POST", pattern: new RegExp(`^${PROJECT}/issues/${ID}/comments$`) },
];

export type TokenScope = "read" | "read_write";

/**
 * `allowed`, or why not: `read_only` (the address is a write one and this token may only read: worth a clearer answer, since the fix is a
 * new token) or `not_allowed` (the address is closed to every token). `url` is the request's original address; the query string and a
 * trailing slash do not matter.
 */
export function tokenAccess(method: string, url: string, scope: TokenScope): "allowed" | "read_only" | "not_allowed" {
  const path = (url.split("?")[0] ?? "").replace(/\/+$/, "");
  if (method === "GET") return ALLOWED_GET_PATHS.some((pattern) => pattern.test(path)) ? "allowed" : "not_allowed";
  if (!ALLOWED_WRITE_PATHS.some((write) => write.method === method && write.pattern.test(path))) return "not_allowed";
  return scope === "read_write" ? "allowed" : "read_only";
}

export function tokenMayCall(method: string, url: string, scope: TokenScope = "read"): boolean {
  return tokenAccess(method, url, scope) === "allowed";
}
