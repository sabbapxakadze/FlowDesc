import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { createIssueViaApi } from "../support/api";

/**
 * "Ask FlowDesc" panel (ADR 0077, slice 4). The e2e API runs with AI_DRIVER=fake, so the answer is always "This is a fake answer." and what these
 * tests check is everything around it: the panel, the sources found by the real search, the limits line, one-panel-at-a-time, and a phone.
 * The server's rules (limits, injection, tenants) are tested over HTTP in apps/api; a real model is never called from here.
 */

const askRow = (page: Page) => page.getByRole("button", { name: "Ask FlowDesc", exact: true });
const panelOf = (page: Page) => page.getByRole("dialog", { name: "Ask FlowDesc" });
const issuePanelOf = (page: Page) => page.getByRole("dialog", { name: "Issue", exact: true });
const box = (page: Page) => panelOf(page).getByLabel("Your question");

async function setup(page: Page) {
  return createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: ["Alpha login broken", "Beta signup slow"] });
}

/** Replaces the server's answer with a fixed one, so the test controls exactly what the panel is given. */
async function answerWith(page: Page, answer: string, sources: unknown[] = []) {
  await page.route("**/api/v1/organizations/*/ask", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { answer, sources, limits: { remaining: 9, limit: 10, window: "hour" } } }),
    }),
  );
}

test("a question gets an answer, the sources the real search found as links, and the questions left", async ({ loggedInPage: page }) => {
  // Why: the whole path through the real server (search, the fake model, the cleaner). The chip must point at the issue the search found, and the
  // person must see how many questions are left.
  await setup(page);
  await askRow(page).click();
  await expect(panelOf(page)).toBeVisible();
  await expect(panelOf(page)).toContainText("sent to Cloudflare");

  await box(page).fill("Why is the alpha login broken?");
  await box(page).press("Enter");
  await expect(panelOf(page).getByRole("log")).toContainText("This is a fake answer.");
  await expect(panelOf(page).getByRole("link", { name: /WEB-1.*Alpha login broken/ })).toHaveAttribute("href", "/projects/WEB/issues/WEB-1");
  await expect(panelOf(page)).toContainText("9 of 10 questions left this hour");
  await expect(box(page)).toHaveValue("");
});

test("Shift+Enter makes a new line instead of sending", async ({ loggedInPage: page }) => {
  // Why: people write two-line questions; Enter alone must not fire a half-written one.
  await askRow(page).click();
  await box(page).fill("first line");
  await box(page).press("Shift+Enter");
  await box(page).pressSequentially("second line");
  await expect(box(page)).toHaveValue("first line\nsecond line");
  await expect(panelOf(page).getByRole("log")).toHaveCount(0);
});

test("the chat is kept when the panel is closed, and New chat clears it", async ({ loggedInPage: page }) => {
  // Why: closing the panel to look at the page must not lose the conversation, and clearing must really clear it (it is only in memory).
  await setup(page);
  await askRow(page).click();
  await box(page).fill("alpha");
  await box(page).press("Enter");
  await expect(panelOf(page).getByRole("log")).toContainText("This is a fake answer.");

  await page.keyboard.press("Escape");
  await expect(panelOf(page)).toHaveCount(0);
  await askRow(page).click();
  await expect(panelOf(page).getByRole("log")).toContainText("This is a fake answer.");

  await panelOf(page).getByRole("button", { name: "New chat" }).first().click();
  await expect(panelOf(page).getByRole("log")).toHaveCount(0);
  await expect(panelOf(page)).toContainText("What is overdue?");
});

test("only one right-hand panel is open at a time: an issue closes Ask, and Ask closes the issue", async ({ loggedInPage: page }) => {
  // Why: two floating panels on the same edge would sit on top of each other (ADR 0077).
  const { projectId } = await setup(page);
  await page.goto(`/projects/${projectId}`);
  await askRow(page).click();
  await expect(panelOf(page)).toBeVisible();

  await page.getByRole("link", { name: /Alpha login broken/ }).first().click();
  await expect(issuePanelOf(page)).toBeVisible();
  await expect(panelOf(page)).toHaveCount(0);

  await askRow(page).click();
  await expect(panelOf(page)).toBeVisible();
  await expect(issuePanelOf(page)).toHaveCount(0);
  await expect(page).not.toHaveURL(/issue=/);
});

test("a refused question says why, and what was typed stays usable", async ({ loggedInPage: page }) => {
  // Why: the server's friendly limit message must reach the person as it is, not as a generic failure.
  await page.route("**/api/v1/organizations/*/ask", (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "ask_limit_person", message: "You have used your 10 questions for this hour. Try again in 12 minutes.", data: { window: "hour", retryAfterSeconds: 720 } } }),
    }),
  );
  await askRow(page).click();
  await box(page).fill("anything");
  await box(page).press("Enter");
  await expect(panelOf(page).getByRole("alert")).toContainText("Try again in 12 minutes.");
  await expect(box(page)).toBeEnabled();
});

test("when Ask is switched off the sidebar has no Ask row", async ({ loggedInPage: page }) => {
  // Why: a feature the server has turned off must not be offered (the live site stays off until the settings are added).
  await page.route("**/api/v1/ask/info", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: { enabled: false, maxQuestionLength: 500 } }) }),
  );
  await page.reload();
  await expect(page.getByRole("link", { name: "Labels" })).toBeVisible();
  await expect(askRow(page)).toHaveCount(0);
});

test("an answer is shown as plain text: HTML and a link in it are not run or followed", async ({ loggedInPage: page }) => {
  // Why: the server cleans the answer, but the panel must not depend on that (second line): React text, never HTML.
  await answerWith(page, '<img src=x onerror="window.__pwned=1"> <b>bold</b> [S1]', [{ n: 1, key: "WEB-1", title: "Alpha", status: "todo" }]);
  await askRow(page).click();
  await box(page).fill("x");
  await box(page).press("Enter");
  const log = panelOf(page).getByRole("log");
  await expect(log).toContainText("<img src=x");
  await expect(log).toContainText("<b>bold</b>");
  await expect(log.locator("img, b")).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
  await expect(log.getByRole("link", { name: /Source 1: WEB-1/ })).toBeVisible();
});

for (const width of [390, 360]) {
  test(`on a ${width}px phone it is a full-screen sheet that fits, with the question box in reach`, async ({ loggedInPage: page }) => {
    // Why: the owner asked for no mobile bugs. A long unbroken word must wrap, nothing may scroll sideways, the drawer must give way to the
    // sheet, and the box and Ask button must stay inside the screen.
    await page.setViewportSize({ width, height: 740 });
    await answerWith(page, `${"x".repeat(180)} and a normal sentence [S1]`, [
      { n: 1, key: "WEB-1", title: "A very long issue title ".repeat(6), status: "in_progress" },
    ]);
    await page.getByRole("button", { name: "Open menu" }).click();
    await askRow(page).click();
    await expect(page.getByRole("dialog", { name: "Navigation" })).toHaveCount(0);
    const panel = panelOf(page);
    await expect(panel).toBeVisible();

    const sheet = await panel.boundingBox();
    expect(sheet).toMatchObject({ x: 0, y: 0, width, height: 740 });

    await box(page).fill("what is going on?");
    // Enter, not a click: in development the query devtools' floating icon sits over the Ask button (it does not exist in the built app).
    await box(page).press("Enter");
    await expect(panel.getByRole("log")).toContainText("a normal sentence");

    const inside = async (locator: ReturnType<Page["locator"]>) => {
      const b = await locator.boundingBox();
      expect(b).not.toBeNull();
      expect(b!.x).toBeGreaterThanOrEqual(0);
      expect(b!.x + b!.width).toBeLessThanOrEqual(width + 0.5);
      expect(b!.y + b!.height).toBeLessThanOrEqual(740 + 0.5);
    };
    await inside(box(page));
    await inside(panel.getByRole("button", { name: "Ask", exact: true }));
    await inside(panel.getByRole("link", { name: /WEB-1/ }).last());
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  });
}
