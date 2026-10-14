import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { apiSession, createIssueViaApi } from "../support/api";

/**
 * Access tokens on the Account page (ADR 0070, 0074): a secret a person gives to an AI app, read-only by default or with write access. The API rules (hashing, expiry, the list
 * of addresses a token may call) are tested over HTTP in apps/api; these tests are about the screen and that its token really works.
 */

const section = (page: Page, name: string) => page.getByRole("region", { name });

async function createToken(page: Page, name: string) {
  await page.goto("/account");
  const tokens = section(page, "Access tokens");
  await tokens.getByLabel("Token name").fill(name);
  await tokens.getByRole("button", { name: "Create token" }).click();
  const secret = await tokens.getByLabel("New access token").inputValue();
  return { tokens, secret };
}

test("a created token is shown once, listed without its secret, and gone after Done", async ({ loggedInPage: page }) => {
  // Why: the server keeps only a hash, so the screen is the one chance to copy the secret, and it must not stay on the page afterwards.
  const { tokens, secret } = await createToken(page, "Claude on my laptop");
  expect(secret).toMatch(/^fd_pat_/);
  await expect(tokens).toContainText("This is the only time you will see it");

  await tokens.getByRole("button", { name: "Done" }).click();
  await expect(tokens.getByLabel("New access token")).toHaveCount(0);
  const row = tokens.getByRole("listitem", { name: "Claude on my laptop" });
  await expect(row).toContainText("Active");
  await expect(row).toContainText("never used");
  await expect(row).toContainText("Read-only");
  expect(await page.content()).not.toContain(secret);

  await page.reload();
  await expect(section(page, "Access tokens").getByRole("listitem", { name: "Claude on my laptop" })).toBeVisible();
  expect(await page.content()).not.toContain(secret);
});

test("read only is the default; Read and write says what it allows, makes a token that can write, and the history shows 'via token'", async ({
  loggedInPage: page,
}) => {
  // Why: write access (ADR 0074) must be a deliberate choice that explains itself, and the label must be true: the token it makes must really write
  // (and the plain one must really not), and the person must be able to see afterwards what was done through a token.
  const { projectId } = await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: ["Seed"] });
  const { base } = await apiSession(page.request);
  await page.goto("/account");
  const tokens = section(page, "Access tokens");
  await expect(tokens.getByRole("radio", { name: "Read only" })).toBeChecked();
  await expect(tokens.getByRole("note")).toHaveCount(0);

  // A read-only token (the default) cannot write.
  await tokens.getByLabel("Token name").fill("Looker");
  await tokens.getByRole("button", { name: "Create token" }).click();
  const readSecret = await tokens.getByLabel("New access token").inputValue();
  await tokens.getByRole("button", { name: "Done" }).click();
  const issues = `${base}/projects/${projectId}/issues`;
  const refused = await page.request.post(issues, { headers: { Authorization: `Bearer ${readSecret}` }, data: { title: "Nope" } });
  expect(refused.status()).toBe(403);
  expect((await refused.json()).error.code).toBe("token_read_only");

  // Read and write explains itself, and the form goes back to the safe choice for the next token.
  await tokens.getByText("Read and write", { exact: true }).click();
  await expect(tokens.getByRole("note")).toContainText("one issue at a time");
  await expect(tokens.getByRole("note")).toContainText("It still cannot delete anything");
  await tokens.getByLabel("Token name").fill("Writer");
  await tokens.getByRole("button", { name: "Create token" }).click();
  const writeSecret = await tokens.getByLabel("New access token").inputValue();
  await tokens.getByRole("button", { name: "Done" }).click();
  await expect(tokens.getByRole("radio", { name: "Read only" })).toBeChecked();
  await expect(tokens.getByRole("listitem", { name: "Writer" })).toContainText("Read and write");
  await expect(tokens.getByRole("listitem", { name: "Looker" })).toContainText("Read-only");

  const created = await page.request.post(issues, { headers: { Authorization: `Bearer ${writeSecret}` }, data: { title: "Made by an AI" } });
  expect(created.status()).toBe(201);
  const number = (await created.json()).data.number as number;

  // A person opening the issue sees it was made through a token.
  await page.goto(`/projects/WEB/issues/WEB-${number}`);
  await expect(page.getByRole("heading", { name: "Made by an AI" })).toBeVisible();
  await expect(page.getByText("via token")).toBeVisible();
  // And the seeded issue, made by hand, does not say it.
  await page.goto("/projects/WEB/issues/WEB-1");
  await expect(page.getByRole("heading", { name: "Seed" })).toBeVisible();
  await expect(page.getByText("via token")).toHaveCount(0);
});

test("the secret really works for a read, and the row then says when it was used", async ({ loggedInPage: page }) => {
  // Why: a screen that shows a token which does not work would be worse than none.
  const { tokens, secret } = await createToken(page, "Reader");
  await tokens.getByRole("button", { name: "Done" }).click();

  const context = await page.request.get("/api/v1/users/me/context", { headers: { Authorization: `Bearer ${secret}` } });
  expect(context.status()).toBe(200);
  expect((await context.json()).data.organization.role).toBe("owner");
  const write = await page.request.post("/api/v1/users/me/api-tokens", {
    headers: { Authorization: `Bearer ${secret}` },
    data: { name: "sibling", scope: "read", expiresInDays: 365 },
  });
  expect(write.status()).toBe(403); // a token cannot make another token

  await page.reload();
  await expect(section(page, "Access tokens").getByRole("listitem", { name: "Reader" })).toContainText("last used");
});

test("revoking asks first, then the token stops working and the row says Revoked", async ({ loggedInPage: page }) => {
  // Why: revoking is the emergency brake; it must be asked for deliberately and take effect straight away.
  const { tokens, secret } = await createToken(page, "To revoke");
  await tokens.getByRole("button", { name: "Done" }).click();
  const headers = { Authorization: `Bearer ${secret}` };
  expect((await page.request.get("/api/v1/users/me/context", { headers })).status()).toBe(200);

  const row = tokens.getByRole("listitem", { name: "To revoke" });
  await row.getByRole("button", { name: "Revoke" }).click();
  await expect(row).toContainText("Apps using this token stop working at once");
  await row.getByRole("button", { name: "Cancel" }).click();
  expect((await page.request.get("/api/v1/users/me/context", { headers })).status()).toBe(200); // backing out changed nothing

  await row.getByRole("button", { name: "Revoke" }).click();
  await row.getByRole("button", { name: "Yes, revoke it" }).click();
  await expect(row).toContainText("Revoked");
  await expect(row.getByRole("button", { name: "Revoke" })).toHaveCount(0);
  expect((await page.request.get("/api/v1/users/me/context", { headers })).status()).toBe(401);
});

test("a token needs a name", async ({ loggedInPage: page }) => {
  // Why: the name is how the person tells tokens apart in the list.
  await page.goto("/account");
  const tokens = section(page, "Access tokens");
  await tokens.getByRole("button", { name: "Create token" }).click();
  await expect(tokens.getByText("Give the token a name.")).toBeVisible();
  await expect(tokens.getByLabel("New access token")).toHaveCount(0);
});

test("a demo copy is told tokens are not available, with no form", async ({ page }) => {
  // Why: the server refuses tokens in a demo (ADR 0044), so a visitor must not meet a form that can only fail.
  await page.goto("/");
  await page.getByRole("button", { name: "Try the demo" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "My work" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/account");
  const tokens = section(page, "Access tokens");
  await expect(tokens).toContainText("not available in the demo");
  await expect(tokens.getByRole("button", { name: "Create token" })).toHaveCount(0);
});
