import { test, expect } from "../support/fixtures";
import { createIssueViaApi } from "../support/api";

/**
 * The production smoke test (ADR 0046): the built web app served by the one API process, the way Render will run it. It checks the things only a real
 * production-mode run can show: the page and its bundle are served with the right headers and a Content-Security-Policy that blocks nothing the
 * app needs, deep links work, a missing file is a 404 and an unknown API address a JSON 404, a session survives a reload, live updates work over
 * the WebSocket, and "Try the demo" works. The behaviour of each feature is tested elsewhere; this only proves the packaging.
 */

/** Records every Content-Security-Policy violation the browser reports, so a test can assert there were none. */
async function recordCspViolations(page: import("@playwright/test").Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __csp: string[] };
    w.__csp = [];
    document.addEventListener("securitypolicyviolation", (event) => w.__csp.push(`${event.violatedDirective} blocked ${event.blockedURI}`));
  });
}
const violations = (page: import("@playwright/test").Page) => page.evaluate(() => (window as unknown as { __csp: string[] }).__csp);

test("the landing page comes from the one server, with security headers and nothing blocked by the policy", async ({ page }) => {
  // Why: a Content-Security-Policy that is too strict breaks the app silently in production only; this loads the real build under the real policy.
  await recordCspViolations(page);
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("401")) consoleErrors.push(message.text()); // the visitor's silent session check answers 401
  });

  const response = await page.goto("/");
  expect(response!.status()).toBe(200);
  const headers = response!.headers();
  expect(headers["cache-control"]).toBe("no-cache"); // the page itself: a new deploy is picked up at once
  expect(headers["content-security-policy"]).toMatch(/script-src 'self' 'sha256-/);
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-powered-by"]).toBeUndefined();

  await expect(page.getByRole("heading", { level: 1, name: "Plan the work. Follow it through." })).toBeVisible();
  // The theme: the inline script in index.html (allowed by hash) and the app's own store both run under the policy.
  await page.getByRole("group", { name: "Theme" }).getByRole("button", { name: "Dark" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Issues" }).click(); // the landing preview swaps pictures (images load under img-src)
  await expect(page.getByRole("img", { name: /^The FlowDesc issue list/ })).toBeVisible();

  expect(await violations(page)).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("hashed bundles are cached for a year; deep links open the app; a missing file is a 404 and an unknown API address a JSON 404", async ({ page, request }) => {
  // Why: these are the rules of serving a single-page app from the API process; each one fails in its own confusing way when wrong.
  await page.goto("/");
  const bundle = await page.evaluate(() => [...document.querySelectorAll("script[src]")].map((s) => s.getAttribute("src")!).find((src) => src.startsWith("/assets/"))!);
  const asset = await request.get(bundle);
  expect(asset.status()).toBe(200);
  expect(asset.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");

  const deep = await page.goto("/projects/WEB/issues/WEB-1"); // not a file: the app opens and, signed out, sends the visitor to log in
  expect(deep!.status()).toBe(200);
  await expect(page).toHaveURL(/\/login$/);

  const missing = await request.get("/assets/does-not-exist-123.js");
  expect(missing.status()).toBe(404);
  expect(missing.headers()["content-type"]).not.toContain("html");
  const api = await request.get("/api/v1/nothing-here");
  expect(api.status()).toBe(404);
  expect((await api.json()).error.code).toBe("not_found");
  expect((await request.get("/api/health")).status()).toBe(200);
});

test("sign in, a session that survives a reload, and a live update over the WebSocket, all under the production policy", async ({ loggedInPage: page }) => {
  // Why: the cookie flags (Secure, path), the session refresh and Socket.IO's connection are what a one-address setup is for; none of it may be blocked by headers.
  await recordCspViolations(page);
  const { projectId, issueIds } = await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: ["Smoke issue"] });

  const socketOpened = page.waitForEvent("websocket", (socket) => socket.url().includes("/socket.io"));
  await page.goto(`/projects/${projectId}/issues/${issueIds[0]}`);
  await expect(page.getByText("created this issue")).toBeVisible();
  await socketOpened;

  // Someone else comments through the API: it appears here without a reload.
  const login = await page.request.post("/api/v1/auth/login", { data: { email: "e2e-user@example.com", password: "password123" } });
  const { accessToken, organization } = await login.json();
  const comment = await page.request.post(`/api/v1/organizations/${organization.id}/projects/${projectId}/issues/${issueIds[0]}/comments`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { body: "Posted while the page was open" },
  });
  expect(comment.status()).toBe(201);
  await expect(page.getByRole("listitem").filter({ hasText: "Posted while the page was open" })).toBeVisible();

  await page.reload(); // the session comes back through the refresh cookie
  await expect(page.getByText("Posted while the page was open")).toBeVisible();
  expect(await violations(page)).toEqual([]);
});

test("Try the demo works in production mode: a private copy, signed in, with the demo bar", async ({ page }) => {
  // Why: it is a public write endpoint behind the rate limiter, which is ON here (it is skipped in the test environment).
  await page.goto("/");
  await page.getByRole("button", { name: "Try the demo" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "My work" })).toBeVisible();
  await expect(page.getByTestId("demo-bar")).toContainText("This is a demo with sample data");
});
