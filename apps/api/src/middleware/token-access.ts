/**
 * The one list of addresses a personal access token may call (ADR 0070). Everything not on it is refused for a token: all writes
 * (this slice is read-only), everything under /auth, token management itself, account, profile and upload addresses, invitations,
 * the audit log and notifications. A list of what IS allowed, in one file, so the whole reach of a token can be read at a glance and
 * a new route is closed to tokens until someone adds it here on purpose.
 *
 * A token still goes through requireOrgMembership and the role checks like any signed-in person, so being on this list never gives
 * more than its owner can already see.
 */
const ID = "[^/]+";
const ORG = `/api/v1/organizations/${ID}`;
const PROJECT = `${ORG}/projects/${ID}`;

const ALLOWED_GET_PATHS: RegExp[] = [
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
].map((pattern) => new RegExp(`^${pattern}$`));

/** `url` is the request's original address; the query string and a trailing slash do not matter. */
export function tokenMayCall(method: string, url: string): boolean {
  if (method !== "GET") return false;
  const path = (url.split("?")[0] ?? "").replace(/\/+$/, "");
  return ALLOWED_GET_PATHS.some((pattern) => pattern.test(path));
}
