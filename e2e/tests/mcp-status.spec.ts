import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";

/**
 * The MCP pill beside the theme switch, the "?" help beside Access tokens, and the Log out button (ADR 0071). The pill is green only while a
 * token that still works was used in the last five minutes; the rules of that are unit-tested in entities/api-token/lib/mcpStatus.test.ts, so
 * these tests check the real thing end to end: a real token, a real request with it, a real revoke.
 */

const pill = (page: Page) => page.locator('[data-tour="mcp-status"]');
const tokens = (page: Page) => page.getByRole("region", { name: "Access tokens" });

async function makeToken(page: Page, name: string) {
  await page.goto("/account");
  await tokens(page).getByLabel("Token name").fill(name);
  await tokens(page).getByRole("button", { name: "Create token" }).click();
  const secret = await tokens(page).getByLabel("New access token").inputValue();
  await tokens(page).getByRole("button", { name: "Done" }).click();
  return secret;
}

test("the pill starts grey and says there is no token; it links to the Access tokens section", async ({ loggedInPage: page }) => {
  // Why: a new person must see the entry point, and the state has to be readable without the colour (screen readers, tooltip).
  await page.goto("/");
  await expect(pill(page)).toBeVisible();
  // The label is read first: while the tokens are still loading the pill is grey too ("MCP: checking"), so the state alone would pass too early.
  await expect(pill(page)).toHaveAttribute("aria-label", /no access token yet/);
  await expect(pill(page)).toHaveAttribute("data-mcp-state", "idle");

  await pill(page).click();
  await expect(page).toHaveURL(/\/account#access-tokens$/);
  await expect(tokens(page)).toBeInViewport();
});

test("the pill turns green after a token is used, and grey again after it is revoked", async ({ loggedInPage: page }) => {
  // Why: the whole feature. Green must follow real use of a real token, and revoking must switch it off, or the dot would mislead.
  const secret = await makeToken(page, "Dot check");
  await page.goto("/");
  await expect(pill(page)).toHaveAttribute("aria-label", /no recent activity/); // loaded: a token that nothing has used yet...
  await expect(pill(page)).toHaveAttribute("data-mcp-state", "idle"); // ...is not "in use"
  expect((await page.request.get("/api/v1/users/me/context", { headers: { Authorization: `Bearer ${secret}` } })).status()).toBe(200);

  await page.goto("/");
  await expect(pill(page)).toHaveAttribute("aria-label", /in use \(an access token was used/);
  await expect(pill(page)).toHaveAttribute("data-mcp-state", "in-use");

  await page.goto("/account");
  const row = tokens(page).getByRole("listitem", { name: "Dot check" });
  await row.getByRole("button", { name: "Revoke" }).click();
  await row.getByRole("button", { name: "Yes, revoke it" }).click();
  await expect(row).toContainText("Revoked");
  await expect(pill(page)).toHaveAttribute("aria-label", /no access token yet/); // the list refreshed, the same query feeds the pill
  await expect(pill(page)).toHaveAttribute("data-mcp-state", "idle");
});

test("the ? beside Access tokens explains the setup with copyable commands and no real token", async ({ loggedInPage: page }) => {
  // Why: the section is useless to someone who has never heard of MCP. The help must show the order of steps, and must never put a real secret
  // into a command that can be copied.
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]); // the test browser refuses clipboard use unless allowed
  const secret = await makeToken(page, "Help check");
  await tokens(page).getByRole("button", { name: "How do I connect an AI app?" }).click();
  const dialog = page.getByRole("dialog", { name: "Use FlowDesc from an AI app" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("npx -y flowdesc-mcp");
  await expect(dialog).toContainText("fd_pat_YOUR_TOKEN");
  expect(await dialog.innerText()).not.toContain(secret);
  await expect(dialog.getByRole("link", { name: "package page on npm" })).toHaveAttribute("href", "https://www.npmjs.com/package/flowdesc-mcp");

  await dialog.getByRole("button", { name: "Copy" }).first().click();
  await expect(dialog.getByRole("button", { name: "Copied" })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe("claude mcp add --env FLOWDESC_TOKEN=fd_pat_YOUR_TOKEN --transport stdio flowdesc -- npx -y flowdesc-mcp");

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(tokens(page).getByRole("button", { name: "How do I connect an AI app?" })).toBeFocused();
});

test("Log out is a real button with a visible border, and still logs out", async ({ loggedInPage: page }) => {
  // Why: it used to be underlined text. It must look like a button (a border) and keep its name, so keyboard and screen-reader users and the
  // other specs that click "Log out" are unaffected.
  await page.goto("/");
  const logout = page.getByRole("button", { name: "Log out" });
  await expect(logout).toBeVisible();
  const border = await logout.evaluate((el) => getComputedStyle(el).borderTopWidth);
  expect(border).toBe("1px");
  await logout.click();
  await expect(page).toHaveURL(/\/login$/);
});

test("a demo copy has no MCP pill", async ({ page }) => {
  // Why: tokens are refused in a demo (ADR 0044), so a pill that links to a section that cannot work would only mislead.
  await page.goto("/");
  await page.getByRole("button", { name: "Try the demo" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "My work" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("group", { name: "Theme" })).toBeVisible();
  await expect(pill(page)).toHaveCount(0);
});
