import { beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { eq, sql } from "drizzle-orm";
import { app } from "../../app.js";
import { db } from "../../db/client.js";
import { resetDatabase } from "../../db/test-utils.js";
import { oauthIdentities, users } from "../../db/schema/index.js";

/**
 * Sign in with Google / GitHub (ADR 0042), over real HTTP and the real database. Under NODE_ENV "test" both providers
 * are the fake in lib/oauth/fake.ts: its "authorize URL" is the callback itself with a code that names the profile, so
 * the real state cookie, PKCE state, linking rules and sessions all run, with no network.
 */

const PASSWORD = "password123";
type Profile = { providerUserId: string; email: string; emailVerified: boolean; name: string };
const GOOGLE_PERSON: Profile = { providerUserId: "g-1", email: "gina@example.com", emailVerified: true, name: "Gina Google" };

const cookieHeader = (res: request.Response, name: string) =>
  ((res.headers["set-cookie"] as unknown as string[] | undefined) ?? []).find((c) => c.startsWith(`${name}=`))?.split(";")[0];

async function start(provider: string, intent: "signin" | "link", profile: Profile | undefined, token?: string) {
  const req = request(app).post(`/api/v1/auth/oauth/${provider}/start`);
  if (profile) req.set("Cookie", `flowdesc_fake_oauth=${encodeURIComponent(JSON.stringify(profile))}`);
  if (token) req.set("Authorization", `Bearer ${token}`);
  return req.send({ intent });
}

/** The whole round trip: start, "go to the provider" (the fake sends straight back), then the callback. */
async function round(opts: { provider?: string; intent?: "signin" | "link"; profile?: Profile; token?: string; tamper?: (u: URL) => void; dropCookie?: boolean }) {
  const provider = opts.provider ?? "google";
  const started = await start(provider, opts.intent ?? "signin", opts.profile ?? GOOGLE_PERSON, opts.token);
  expect(started.status).toBe(200);
  const stateCookie = cookieHeader(started, "flowdesc_oauth_state")!;
  const url = new URL(started.body.url);
  opts.tamper?.(url);
  const callback = request(app).get(url.pathname + url.search);
  if (!opts.dropCookie) callback.set("Cookie", stateCookie);
  return { callback: await callback, stateCookie, callbackPath: url.pathname + url.search };
}

const location = (res: request.Response) => new URL(res.headers.location as string);
const errorOf = (res: request.Response) => location(res).searchParams.get("oauth_error");
const refreshWith = (cookie: string) => request(app).post("/api/v1/auth/refresh").set("Cookie", cookie);

async function registerPasswordUser(email: string, { verified }: { verified: boolean }) {
  await request(app).post("/api/v1/auth/register").send({ email, password: PASSWORD, name: "Password Person", organizationName: "Pw Org" }).expect(201);
  if (verified) await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.email, email));
  const login = await request(app).post("/api/v1/auth/login").send({ email, password: PASSWORD }).expect(200);
  return { token: login.body.accessToken as string, cookie: cookieHeader(login, "flowdesc_refresh_token")!, userId: login.body.user.id as string };
}
const account = (token: string) => request(app).get("/api/v1/users/me/account").set("Authorization", `Bearer ${token}`);

/** A person who signed up with Google and so has no password. */
async function googleSignUp(profile = GOOGLE_PERSON) {
  const { callback } = await round({ profile });
  const cookie = cookieHeader(callback, "flowdesc_refresh_token")!;
  const session = await refreshWith(cookie).expect(200);
  return { cookie: cookieHeader(session, "flowdesc_refresh_token")!, token: session.body.accessToken as string, userId: session.body.user.id as string };
}

describe("oauth: which providers exist", () => {
  beforeEach(resetDatabase);

  it("lists the providers that are switched on", async () => {
    // Why: the sign-in buttons are drawn from this list, so a provider without credentials never shows a dead button.
    const res = await request(app).get("/api/v1/auth/oauth/providers").expect(200);
    expect(res.body.data.providers).toEqual(["google", "github"]); // the fake stands in for both under NODE_ENV=test
  });

  it("refuses a provider that does not exist", async () => {
    // Why: the provider is part of the URL; anything else must not reach the flow.
    await request(app).post("/api/v1/auth/oauth/facebook/start").send({ intent: "signin" }).expect(404);
  });
});

describe("oauth: signing up and signing in", () => {
  beforeEach(resetDatabase);

  it("a first sign-in creates an account with its own organization, verified, with no password", async () => {
    // Why: this is "Create account with Google": it must produce a usable session, an owner membership and an
    // account that does not pretend to have a password.
    const { callback } = await round({});
    expect(callback.status).toBe(302);
    expect(location(callback).pathname).toBe("/");
    expect(location(callback).searchParams.get("oauth_error")).toBeNull();

    const session = await refreshWith(cookieHeader(callback, "flowdesc_refresh_token")!).expect(200);
    expect(session.body.user.email).toBe("gina@example.com");
    expect(session.body.organization.name).toBe("Gina Google's workspace");

    const [row] = await db.select().from(users).where(eq(users.email, "gina@example.com"));
    expect(row!.passwordHash).toBeNull();
    expect(row!.emailVerifiedAt).not.toBeNull();
    expect(await db.select().from(oauthIdentities).where(eq(oauthIdentities.userId, row!.id))).toHaveLength(1);

    const acct = (await account(session.body.accessToken).expect(200)).body.data;
    expect(acct.hasPassword).toBe(false);
    expect(acct.connectedAccounts).toEqual([{ provider: "google", email: "gina@example.com" }]);
  });

  it("signing in again finds the same account, even if the provider's email changed", async () => {
    // Why: the provider's own id is the identity, not the email; emails change hands.
    const first = await googleSignUp();
    const { callback } = await round({ profile: { ...GOOGLE_PERSON, email: "gina.new@example.com" } });
    const again = await refreshWith(cookieHeader(callback, "flowdesc_refresh_token")!).expect(200);
    expect(again.body.user.id).toBe(first.userId);
    expect(await db.select().from(users)).toHaveLength(1);
  });

  it("a verified account with the same email is connected to, and keeps its password", async () => {
    // Why: someone who registered with a password and later presses "Google" must land in their own account.
    const pw = await registerPasswordUser("gina@example.com", { verified: true });
    const { callback } = await round({});
    const session = await refreshWith(cookieHeader(callback, "flowdesc_refresh_token")!).expect(200);
    expect(session.body.user.id).toBe(pw.userId);
    await request(app).post("/api/v1/auth/login").send({ email: "gina@example.com", password: PASSWORD }).expect(200);
    expect((await account(session.body.accessToken)).body.data.connectedAccounts).toHaveLength(1);
  });

  it("an account whose email was never verified is taken over: no password, old sessions ended", async () => {
    // Why: pre-hijacking. Someone could register a victim's address with their own password; when the real owner then
    // proves the address through Google, the squatter's password and sessions must stop working.
    const squatter = await registerPasswordUser("gina@example.com", { verified: false });
    const { callback } = await round({});
    const session = await refreshWith(cookieHeader(callback, "flowdesc_refresh_token")!).expect(200);
    expect(session.body.user.id).toBe(squatter.userId); // same account, now the real owner's

    await request(app).post("/api/v1/auth/login").send({ email: "gina@example.com", password: PASSWORD }).expect(401);
    await refreshWith(squatter.cookie).expect(401);
    expect((await account(session.body.accessToken)).body.data.hasPassword).toBe(false);
  });

  it("an email the provider did not verify is refused and creates nothing", async () => {
    // Why: an unconfirmed address proves nothing; accepting it would let anyone claim any address.
    const { callback } = await round({ profile: { ...GOOGLE_PERSON, emailVerified: false } });
    expect(location(callback).pathname).toBe("/login");
    expect(errorOf(callback)).toBe("oauth_email_unverified");
    expect(await db.select().from(users)).toHaveLength(0);
  });

  it("a person who was removed from every organization cannot sign in", async () => {
    // Why: the same rule as the password login (no organization, no session), shown as its own message.
    await googleSignUp();
    await db.execute(sql`DELETE FROM organization_members`);
    const { callback } = await round({});
    expect(errorOf(callback)).toBe("oauth_no_organization");
  });

  it("a password login for a passwordless account fails like any wrong password", async () => {
    // Why: no password hash must never mean "any password works" or a crash; and the answer must not reveal that
    // the account exists.
    await googleSignUp();
    const res = await request(app).post("/api/v1/auth/login").send({ email: "gina@example.com", password: "anything-at-all" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("invalid_credentials");
  });
});

describe("oauth: the state check", () => {
  beforeEach(resetDatabase);

  it("a callback without the state cookie is refused", async () => {
    // Why: the cookie is what ties the callback to the browser that started it (login CSRF protection).
    const { callback } = await round({ dropCookie: true });
    expect(errorOf(callback)).toBe("oauth_state_invalid");
    expect(await db.select().from(users)).toHaveLength(0);
  });

  it("a callback whose state does not match the cookie is refused", async () => {
    // Why: a forged callback link must not complete someone else's attempt.
    const { callback } = await round({ tamper: (u) => u.searchParams.set("state", "not-the-state") });
    expect(errorOf(callback)).toBe("oauth_state_invalid");
    expect(await db.select().from(users)).toHaveLength(0);
  });

  it("an attempt can be completed once: replaying the callback has no state cookie any more", async () => {
    // Why: the callback clears the cookie, so a copied callback URL is useless.
    const first = await round({});
    expect(errorOf(first.callback)).toBeNull();
    const replay = await request(app).get(first.callbackPath);
    expect(errorOf(replay)).toBe("oauth_state_invalid");
    const cleared = ((first.callback.headers["set-cookie"] as unknown as string[]) ?? []).find((c) => c.startsWith("flowdesc_oauth_state="));
    expect(cleared).toContain("Expires=Thu, 01 Jan 1970");
  });

  it("a state cookie made for one provider does not work on another", async () => {
    // Why: the provider is signed into the cookie, so a Google attempt cannot be finished as GitHub.
    const started = await start("google", "signin", GOOGLE_PERSON);
    const stateCookie = cookieHeader(started, "flowdesc_oauth_state")!;
    const url = new URL(started.body.url);
    const asGithub = url.pathname.replace("/google/", "/github/") + url.search;
    const callback = await request(app).get(asGithub).set("Cookie", stateCookie);
    expect(errorOf(callback)).toBe("oauth_state_invalid");
  });

  it("a refused or cancelled attempt at the provider ends on the login page with its own message", async () => {
    // Why: pressing Cancel at Google sends back ?error= and no code; the person should see "cancelled", not a crash.
    const cb = await request(app).get("/api/v1/auth/oauth/google/callback?error=access_denied");
    expect(location(cb).pathname).toBe("/login");
    expect(errorOf(cb)).toBe("oauth_cancelled");
  });

  it("the state cookie can never be used as an access token", async () => {
    // Why: it is signed with a key derived from the same secret; it must stay a different kind of token.
    const started = await start("google", "signin", GOOGLE_PERSON);
    const value = cookieHeader(started, "flowdesc_oauth_state")!.split("=")[1]!;
    await request(app).get("/api/v1/users/me/account").set("Authorization", `Bearer ${value}`).expect(401);
  });
});

describe("oauth: connecting and disconnecting on the account page", () => {
  beforeEach(resetDatabase);

  it("connecting needs a signed-in person", async () => {
    // Why: "connect" attaches a provider to an account, so it must know whose.
    await start("github", "link", GOOGLE_PERSON).then((res) => expect(res.status).toBe(401));
  });

  it("connects a second provider and lists it", async () => {
    // Why: the whole point of the account page's Connect button.
    const pw = await registerPasswordUser("gina@example.com", { verified: true });
    const { callback } = await round({ provider: "github", intent: "link", token: pw.token, profile: { ...GOOGLE_PERSON, providerUserId: "gh-9" } });
    expect(location(callback).pathname).toBe("/account");
    expect(location(callback).searchParams.get("connected")).toBe("github");
    expect((await account(pw.token)).body.data.connectedAccounts).toEqual([{ provider: "github", email: "gina@example.com" }]);
  });

  it("a provider account that belongs to someone else cannot be connected", async () => {
    // Why: one Google account may belong to only one FlowDesc account, or signing in with it would be ambiguous.
    await googleSignUp(); // g-1 now belongs to Gina
    const other = await registerPasswordUser("other@example.com", { verified: true });
    const { callback } = await round({ intent: "link", token: other.token }); // tries to connect g-1
    expect(location(callback).pathname).toBe("/account");
    expect(errorOf(callback)).toBe("oauth_identity_taken");
    expect((await account(other.token)).body.data.connectedAccounts).toEqual([]);
  });

  it("the only way to sign in cannot be disconnected; after adding a password it can", async () => {
    // Why: removing the last method would lock the person out for good. The password makes a second method.
    const g = await googleSignUp();
    const del = () => request(app).delete("/api/v1/users/me/oauth/google").set("Authorization", `Bearer ${g.token}`);
    const refused = await del();
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("last_sign_in_method");

    await request(app).post("/api/v1/auth/set-password").set("Authorization", `Bearer ${g.token}`).set("Cookie", g.cookie).send({ newPassword: PASSWORD }).expect(200);
    await del().expect(204);
    expect((await account(g.token)).body.data).toMatchObject({ hasPassword: true, connectedAccounts: [] });
    await request(app).post("/api/v1/auth/login").send({ email: "gina@example.com", password: PASSWORD }).expect(200);
  });

  it("two providers connected to a passwordless account: one can go, the last cannot", async () => {
    // Why: the guard counts methods, it is not "never disconnect a provider".
    const g = await googleSignUp();
    await round({ provider: "github", intent: "link", token: g.token, profile: { ...GOOGLE_PERSON, providerUserId: "gh-9" } });
    const as = { Authorization: `Bearer ${g.token}` };
    await request(app).delete("/api/v1/users/me/oauth/google").set(as).expect(204);
    await request(app).delete("/api/v1/users/me/oauth/github").set(as).expect(409);
  });

  it("disconnecting something that is not connected is a 404", async () => {
    // Why: a clear answer instead of a silent success.
    const pw = await registerPasswordUser("gina@example.com", { verified: true });
    await request(app).delete("/api/v1/users/me/oauth/google").set("Authorization", `Bearer ${pw.token}`).expect(404);
  });
});

describe("oauth: accounts without a password", () => {
  beforeEach(resetDatabase);

  it("set-password works once; an account that has a password is told to use change-password", async () => {
    // Why: the first password needs no "current password" (there is none), but must not become a way around it later.
    const g = await googleSignUp();
    const set = (body: object) =>
      request(app).post("/api/v1/auth/set-password").set("Authorization", `Bearer ${g.token}`).set("Cookie", g.cookie).send(body);
    await set({ newPassword: "short" }).expect(400);
    await set({ newPassword: PASSWORD }).expect(200);
    const again = await set({ newPassword: "another-password" });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("password_already_set");
  });

  it("change-password and change-email say 'add a password first' instead of crashing", async () => {
    // Why: both compare against the stored hash, which is null here.
    const g = await googleSignUp();
    const as = { Authorization: `Bearer ${g.token}` };
    const cp = await request(app).post("/api/v1/auth/change-password").set(as).set("Cookie", g.cookie).send({ currentPassword: "x", newPassword: PASSWORD });
    expect(cp.status).toBe(400);
    expect(cp.body.error.details.currentPassword[0]).toMatch(/no password yet/);
    const ce = await request(app).post("/api/v1/auth/email-change/request").set(as).send({ newEmail: "new@example.com", password: "x" });
    expect(ce.status).toBe(400);
    expect(ce.body.error.details.password[0]).toMatch(/no password yet/);
  });
});
