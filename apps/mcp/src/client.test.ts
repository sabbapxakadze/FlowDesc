import { afterEach, describe, expect, it } from "vitest";
import { FlowDescClient, FlowDescError } from "./client.js";
import { ORG_ID, WEB_ID, standardAnswer, startFakeApi, type Answer, type Recorded } from "./fake-api.js";

const TOKEN = "fd_pat_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";

type Fake = Awaited<ReturnType<typeof startFakeApi>>;
const open: Fake[] = [];
async function fake(answer: (r: Recorded) => Answer = standardAnswer) {
  const api = await startFakeApi(answer);
  open.push(api);
  return api;
}
afterEach(async () => {
  await Promise.all(open.splice(0).map((api) => api.close()));
});

const clientFor = (api: Fake, extra: Partial<ConstructorParameters<typeof FlowDescClient>[0]> = {}) =>
  new FlowDescClient({ baseUrl: api.url, token: TOKEN, ...extra });
const failure = async (promise: Promise<unknown>) => (await promise.then(() => undefined, (e: unknown) => e)) as FlowDescError;

describe("sending requests", () => {
  it("sends the token as a Bearer header and the query as parameters, repeating a list", async () => {
    // Why: without the header every call is a 401; and a label filter is a repeated parameter in the API (?label=a&label=b).
    const api = await fake();
    await clientFor(api).get("/users/me/context", { limit: 5, label: ["x", "y"], skipped: undefined });
    const [request] = api.requests;
    expect(request!.authorization).toBe(`Bearer ${TOKEN}`);
    expect(request!.path).toBe("/api/v1/users/me/context");
    expect(request!.query.get("limit")).toBe("5");
    expect(request!.query.getAll("label")).toEqual(["x", "y"]);
    expect(request!.query.has("skipped")).toBe(false);
  });
});

describe("turning failures into sentences a person can act on", () => {
  it("explains a rejected token, and a token that may not do something", async () => {
    // Why: the AI app shows these to the person; "401" alone would not tell them to make a new token.
    const unauthorized = await fake(() => ({ status: 401, body: { error: { code: "unauthenticated", message: "Invalid, revoked or expired access token." } } }));
    const err = await failure(clientFor(unauthorized).get("/x"));
    expect(err.status).toBe(401);
    expect(err.message).toMatch(/invalid, revoked or expired/);
    expect(err.message).toMatch(/Access tokens/);

    const forbidden = await fake(() => ({ status: 403, body: { error: { code: "token_not_allowed", message: "An access token cannot do this." } } }));
    expect((await failure(clientFor(forbidden).get("/x"))).message).toBe("This access token is not allowed to do that.");

    // A write with a read token has its own sentence, naming where to make a better one (the fix is not "use the app").
    const readOnly = await fake(() => ({ status: 403, body: { error: { code: "token_read_only", message: "This access token is read-only." } } }));
    const refused = await failure(clientFor(readOnly).post("/x", { a: 1 }));
    expect(refused.message).toMatch(/read-only/);
    expect(refused.message).toMatch(/Account, Access tokens/);
    expect(refused.code).toBe("token_read_only");
  });

  it("sends a JSON body for a write, with the token, and nothing but the body", async () => {
    // Why: a write that lost its Content-Type or its token would be refused by the API; one that leaked extra fields would change more than asked.
    const api = await fake(() => ({ status: 201, body: { data: { ok: true } } }));
    await clientFor(api).post("/x", { title: "A" });
    await clientFor(api).patch("/y", { version: 2 });
    expect(api.requests.map((r) => [r.method, r.path, r.body])).toEqual([
      ["POST", "/api/v1/x", { title: "A" }],
      ["PATCH", "/api/v1/y", { version: 2 }],
    ]);
    expect(api.requests.every((r) => r.authorization === `Bearer ${TOKEN}`)).toBe(true);
  });

  it("explains rate limiting and server problems, and passes the API's own message for the rest", async () => {
    const limited = await fake(() => ({ status: 429, body: { error: { code: "too_many_requests", message: "Too many attempts." } } }));
    expect((await failure(clientFor(limited).get("/x"))).message).toMatch(/Wait a minute/);
    const broken = await fake(() => ({ status: 500, body: { error: { code: "internal", message: "stack trace here" } } }));
    const serverError = await failure(clientFor(broken).get("/x"));
    expect(serverError.message).toMatch(/status 500/);
    expect(serverError.message).not.toContain("stack trace");
    const missing = await fake(() => ({ status: 404, body: { error: { code: "issue_not_found", message: "Issue not found." } } }));
    expect((await failure(clientFor(missing).get("/x"))).message).toBe("Issue not found.");
  });

  it("reports a server that does not answer, one that is not there, and one that is not FlowDesc", async () => {
    // Why: a wrong FLOWDESC_URL is the other common setup mistake; each case needs its own plain message.
    const slow = await fake(() => ({ delayMs: 400, body: {} }));
    expect((await failure(clientFor(slow, { timeoutMs: 50 }).get("/x"))).message).toMatch(/did not answer within/);

    const gone = await fake();
    const url = gone.url;
    await gone.close(); // closing it again at the end is harmless
    const unreachable = await failure(new FlowDescClient({ baseUrl: url, token: TOKEN }).get("/x"));
    expect(unreachable.message).toMatch(/Could not reach FlowDesc/);

    const html = await fake(() => ({ raw: "<html>hello</html>" }));
    expect((await failure(clientFor(html).get("/x"))).message).toMatch(/not JSON/);
  });

  it("never lets the token into a message, even when the API echoes it back", async () => {
    // Why: tool errors are shown to the AI and logged by its app. A token in one of them is a leaked credential.
    const echo = await fake(() => ({ status: 400, body: { error: { code: "bad", message: `bad request, you sent ${TOKEN}` } } }));
    const client = clientFor(echo);
    const err = await failure(client.get("/x"));
    expect(err.message).not.toContain(TOKEN);
    expect(err.message).toContain("[token]");
    expect(client.describe(new Error(`oops ${TOKEN}`))).not.toContain(TOKEN);
  });
});

describe("remembering what it has already asked", () => {
  it("asks who the token is only once, even for simultaneous questions, and forgets a failure", async () => {
    // Why: every tool needs the organization id; one /context call per tool would double the traffic against a 120-a-minute limit.
    const api = await fake();
    const client = clientFor(api);
    await Promise.all([client.orgPath(), client.orgPath(), client.context()]);
    await client.orgPath();
    expect(api.requests.filter((r) => r.path === "/api/v1/users/me/context")).toHaveLength(1);

    let fail = true;
    const flaky = await fake((r) => (fail && r.path.endsWith("/context") ? { status: 500, body: {} } : standardAnswer(r)));
    const second = clientFor(flaky);
    await failure(second.context());
    fail = false;
    expect((await second.context()).organization.id).toBe(ORG_ID);
  });

  it("finds a project by key or name in any case, lists the real keys on a miss, and refreshes after a minute", async () => {
    // Why: models guess ("web", "Website Redesign"). A miss must teach the right key instead of failing blind.
    let clock = 1_000_000;
    const api = await fake();
    const client = clientFor(api, { now: () => clock });
    expect((await client.resolveProject("web")).id).toBe(WEB_ID);
    expect((await client.resolveProject("website redesign")).key).toBe("WEB");
    const miss = await failure(client.resolveProject("nope"));
    expect(miss.message).toContain("WEB (Website Redesign)");
    expect(miss.message).toContain("OPS (Operations)");

    const projectCalls = () => api.requests.filter((r) => r.path.endsWith("/projects")).length;
    expect(projectCalls()).toBe(1);
    clock += 61_000;
    await client.resolveProject("web");
    expect(projectCalls()).toBe(2);
  });
});
