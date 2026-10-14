import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A pretend FlowDesc API on a local port, for the tests in this package only. It records every request (so a test can say exactly what
 * the server asked for) and answers from a function the test supplies. It cannot tell whether FlowDesc really answers like this: the
 * test against the real API (apps/api, mcp.http.test.ts) is what keeps these fixtures honest.
 */

export type Recorded = {
  method: string;
  path: string;
  query: URLSearchParams;
  authorization: string | undefined;
  /** The JSON body of a POST or PATCH, as sent (undefined for a GET). */
  body: unknown;
};
export type Answer = { status?: number; body?: unknown; raw?: string; delayMs?: number };

export async function startFakeApi(answer: (request: Recorded) => Answer) {
  const requests: Recorded[] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const url = new URL(req.url ?? "/", "http://fake");
      const text = Buffer.concat(chunks).toString("utf8");
      const recorded: Recorded = {
        method: req.method ?? "GET",
        path: url.pathname,
        query: url.searchParams,
        authorization: req.headers.authorization,
        body: text ? (JSON.parse(text) as unknown) : undefined,
      };
      requests.push(recorded);
      const { status = 200, body, raw, delayMs = 0 } = answer(recorded);
      setTimeout(() => {
        res.statusCode = status;
        if (raw !== undefined) {
          res.setHeader("content-type", "text/html");
          res.end(raw);
          return;
        }
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify(body ?? {}));
      }, delayMs);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    requests,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

export const ORG_ID = "11111111-1111-1111-1111-111111111111";
export const USER_ID = "22222222-2222-2222-2222-222222222222";
export const WEB_ID = "33333333-3333-3333-3333-333333333333";
export const OPS_ID = "44444444-4444-4444-4444-444444444444";
export const ISSUE_ID = "55555555-5555-5555-5555-555555555555";
export const LABEL_BUG_ID = "66666666-6666-6666-6666-666666666666";
export const LABEL_UI_ID = "77777777-7777-7777-7777-777777777777";
export const NEW_ISSUE_ID = "88888888-8888-8888-8888-888888888888";
export const COMMENT_ID = "99999999-9999-9999-9999-999999999999";
export const ADA_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
export const ADA2_ID = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const ORG = `/api/v1/organizations/${ORG_ID}`;

/** Answers like the real API for the addresses the tools use. A test overrides one by wrapping this. */
export function standardAnswer(request: Recorded): Answer {
  if (request.method === "POST" && request.path === `${ORG}/projects/${WEB_ID}/issues`) {
    return { status: 201, body: { data: { id: NEW_ISSUE_ID, number: 13, title: (request.body as { title: string }).title, status: "todo", version: 1 } } };
  }
  if (request.method === "POST" && request.path === `${ORG}/projects/${WEB_ID}/issues/${ISSUE_ID}/comments`) {
    return { status: 201, body: { data: { id: COMMENT_ID, body: (request.body as { body: string }).body } } };
  }
  if (request.method === "PATCH" && request.path === `${ORG}/projects/${WEB_ID}/issues/${ISSUE_ID}`) {
    return { body: { data: { id: ISSUE_ID, number: 12, status: "done", version: 4 } } };
  }
  switch (request.path) {
    case `${ORG}/members`:
      return {
        body: {
          data: [
            { userId: USER_ID, name: "Olivia Owner", email: "olivia@example.com" },
            { userId: ADA_ID, name: "Ada Lovelace", email: "ada@example.com" },
            { userId: ADA2_ID, name: "Ada Lovelace", email: "ada.l@example.com" },
          ],
        },
      };
    case "/api/v1/users/me/context":
      return {
        body: {
          data: {
            scope: "read_write",
            user: { id: USER_ID, name: "Olivia Owner", email: "olivia@example.com" },
            organization: { id: ORG_ID, name: "Acme", role: "owner" },
          },
        },
      };
    case `${ORG}/projects`:
      return {
        body: {
          data: [
            { id: WEB_ID, organizationId: ORG_ID, name: "Website Redesign", key: "WEB" },
            { id: OPS_ID, organizationId: ORG_ID, name: "Operations", key: "OPS" },
          ],
        },
      };
    case `${ORG}/projects/summary`:
      return {
        body: {
          data: [
            { projectId: WEB_ID, open: 5, inProgress: 2, overdue: 1, done: 9, total: 16, activeSprint: { name: "Sprint 5", endDate: null }, lastChangeAt: null },
            { projectId: OPS_ID, open: 0, inProgress: 0, overdue: 0, done: 0, total: 0, activeSprint: null, lastChangeAt: null },
          ],
        },
      };
    case `${ORG}/labels`:
      return { body: { data: [{ id: LABEL_BUG_ID, name: "Bug" }, { id: LABEL_UI_ID, name: "UI" }] } };
    case `${ORG}/projects/${WEB_ID}/issues`:
      return { body: { data: [{ id: ISSUE_ID, number: 12, title: "Footer links open the wrong page" }], nextCursor: null } };
    case `${ORG}/projects/${WEB_ID}/issues/by-number/12`:
      return { body: { data: { id: ISSUE_ID, number: 12, title: "Footer links open the wrong page", status: "todo", version: 3 } } };
    case `${ORG}/projects/${WEB_ID}/issues/${ISSUE_ID}/labels`:
      return { body: { data: [{ id: LABEL_BUG_ID, name: "Bug" }] } };
    case `${ORG}/projects/${WEB_ID}/issues/${ISSUE_ID}/events`:
      return { body: { data: [{ type: "issue.created" }, { type: "issue.commented", body: "Looks like the mobile menu." }] } };
    case `${ORG}/search`:
      return { body: { data: [{ id: "a", title: "one" }, { id: "b", title: "two" }, { id: "c", title: "three" }] } };
    case `${ORG}/projects/${WEB_ID}/sprints`:
      return { body: { data: [{ name: "Sprint 5", status: "active" }] } };
    case `${ORG}/projects/${WEB_ID}/backlog`:
      return { body: { data: { backlog: [], activeSprint: null } } };
    case `${ORG}/my-work/issues`:
      return { body: { data: [], total: 0 } };
    case `${ORG}/my-work/week`:
      return { body: { data: { done: 1, total: 3 } } };
    default:
      if (request.path.startsWith(`${ORG}/projects/${WEB_ID}/analytics/`)) return { body: { data: [] } };
      return { status: 404, body: { error: { code: "not_found", message: "No such API route." } } };
  }
}
