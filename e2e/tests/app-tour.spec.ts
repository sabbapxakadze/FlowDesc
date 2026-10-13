import type { Page } from "@playwright/test";
import { test, expect, logInThroughForm, TEST_USER } from "../support/fixtures";
import { createIssueViaApi } from "../support/api";

/**
 * The guided tour behind the Tutorial button (ADR 0040): a dimmed page, a highlight around one part, a card with Back / Next / Skip.
 * It must show the right part, go to the right page, never get stuck on a part that is not there, and never change any data.
 */

const card = (page: Page) => page.locator("[data-tour-card]");
const spot = (page: Page) => page.locator("[data-tour-spot]");
const title = (page: Page) => card(page).getByRole("heading");
const nextButton = (page: Page) =>
  card(page).getByRole("button", { name: /^(Next|Done)$/ });

async function setup(page: Page, titles = ["Something to tour"]) {
  await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles,
  });
  await page.goto("/projects/WEB");
  await expect(page.getByRole("button", { name: /New issue/ })).toBeVisible();
}

async function startTour(page: Page) {
  await page.getByRole("button", { name: "Tutorial" }).click();
  await expect(card(page)).toBeVisible();
}

async function advanceTo(page: Page, heading: string) {
  for (let i = 0; i < 30; i++) {
    if ((await title(page).innerText()) === heading) return;
    await nextButton(page).click();
    await expect(card(page)).toBeVisible();
  }
  throw new Error(`The tour never reached "${heading}"`);
}

test("a new account gets the tour by itself on its first visit, once: Esc, a reload and a second login do not bring it back", async ({ page }) => {
  // Why: a new person should be shown around without finding the Tutorial row (ADR 0052), but never twice: the server remembers it on the
  // account, so a reload, another login or "Skip" must not replay it. The fixture marks its own users as toured, so this test registers directly.
  const res = await page.request.post("/api/v1/auth/register", { data: TEST_USER });
  expect(res.status()).toBe(201);
  await logInThroughForm(page);
  await expect(card(page)).toBeVisible();
  await expect(title(page)).toHaveText("Welcome to FlowDesc");
  await page.keyboard.press("Escape");
  await expect(card(page)).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "My work" })).toBeVisible();
  await page.waitForTimeout(1000); // long enough for a tour that was going to start to start
  await expect(card(page)).toHaveCount(0);

  await page.getByRole("button", { name: "Log out" }).click();
  await logInThroughForm(page);
  await expect(page.getByRole("heading", { level: 1, name: "My work" })).toBeVisible();
  await page.waitForTimeout(1000);
  await expect(card(page)).toHaveCount(0);
});

test("the Tutorial button starts the tour on a centered welcome; Next, Back and the arrow keys move; Esc ends it and focus returns to the button", async ({
  loggedInPage: page,
}) => {
  // Why: this is the front door. It must start, count, move both ways by button and keyboard, and hand focus back when it ends.
  await setup(page);
  await startTour(page);
  await expect(title(page)).toHaveText("Welcome to FlowDesc");
  await expect(card(page)).toContainText(/Step 1 of \d+/);
  await expect(spot(page)).toHaveCount(0); // the welcome has no highlighted part

  await nextButton(page).click();
  await expect(title(page)).toHaveText("Your projects");
  await expect(spot(page)).toHaveCount(1);
  await expect(card(page)).toContainText(/Step 2 of \d+/);

  await page.keyboard.press("ArrowRight");
  await expect(title(page)).toHaveText("Search everything");
  await page.keyboard.press("ArrowLeft");
  await expect(title(page)).toHaveText("Your projects");
  await card(page).getByRole("button", { name: "Back" }).click();
  await expect(title(page)).toHaveText("Welcome to FlowDesc");
  await expect(card(page).getByRole("button", { name: "Back" })).toBeDisabled(); // nothing before the first step

  await page.keyboard.press("Escape");
  await expect(card(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tutorial" })).toBeFocused();
});

test("a step's highlight sits on its target", async ({ loggedInPage: page }) => {
  // Why: a highlight that is a few pixels off, or on the wrong thing, makes the tour useless. Measured against the real element.
  await setup(page);
  await startTour(page);
  await advanceTo(page, "Search everything");
  const target = (await page.locator('[data-tour="search"]').boundingBox())!;
  await expect
    .poll(async () => Math.round((await spot(page).boundingBox())?.x ?? -999))
    .toBe(Math.round(target.x - 6));
  const highlight = (await spot(page).boundingBox())!;
  expect(Math.abs(highlight.y - (target.y - 6))).toBeLessThanOrEqual(2);
  expect(Math.abs(highlight.width - (target.width + 12))).toBeLessThanOrEqual(2);
  expect(Math.abs(highlight.height - (target.height + 12))).toBeLessThanOrEqual(2);
  // The card is beside it, not on top of it.
  const cardBox = (await card(page).boundingBox())!;
  const overlaps =
    cardBox.x < highlight.x + highlight.width &&
    cardBox.x + cardBox.width > highlight.x &&
    cardBox.y < highlight.y + highlight.height &&
    cardBox.y + cardBox.height > highlight.y;
  expect(overlaps).toBe(false);
});

test("a step on another page goes there, and Back returns", async ({
  loggedInPage: page,
}) => {
  // Why: the tour shows the board, which is a different page. It must navigate for the person, in both directions.
  await setup(page);
  await startTour(page);
  await advanceTo(page, "Move work along");
  await expect(page).toHaveURL(/\/projects\/WEB\/board$/);
  const columns = (await page.locator('[data-tour="board-columns"]').boundingBox())!;
  await expect
    .poll(async () => Math.round((await spot(page).boundingBox())?.x ?? -999))
    .toBe(Math.round(columns.x - 6));

  await card(page).getByRole("button", { name: "Back" }).click();
  await expect(title(page)).toHaveText("List or Board");
  await expect(page).toHaveURL(/\/projects\/WEB$/);
});

test("a step whose part is not there is skipped, not stuck", async ({
  loggedInPage: page,
}) => {
  // Why: a project with no issues has no card to point at. The tour must move on to the next step by itself.
  await setup(page, []);
  await startTour(page);
  await advanceTo(page, "Move work along");
  await nextButton(page).click();
  await expect(title(page)).toHaveText("Plan with sprints", { timeout: 10_000 }); // "Open an issue" had no card, so it was passed over
});

test("on a phone the tour still runs to the end", async ({ loggedInPage: page }) => {
  test.setTimeout(90_000); // parts that are not on a phone screen are waited for briefly before being passed over
  // Why: the sidebar is a drawer there, so its parts come and go. Whatever cannot be shown must be passed over, never block the tour.
  await page.setViewportSize({ width: 420, height: 800 });
  await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["One"],
  });
  await page.goto("/projects/WEB");
  // The query devtools button (development builds only) floats at the bottom right and, on a phone, sits over the card's Next button.
  await page.addStyleTag({
    content: ".tsqd-parent-container { display: none !important; }",
  });
  await page.getByRole("button", { name: "Open menu" }).click();
  await startTour(page);
  for (let i = 0; i < 30 && (await card(page).count()) > 0; i++) {
    await nextButton(page).click();
    await page.waitForTimeout(150);
  }
  await expect(card(page)).toHaveCount(0); // finished, within 30 steps
});

test("a whole tour changes no data", async ({ loggedInPage: page }) => {
  // Why: a tutorial that quietly created or moved something would be worse than none. Only reads (and the session's own refresh) may happen.
  const writes: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (
      url.includes("/api/") &&
      request.method() !== "GET" &&
      !url.endsWith("/auth/refresh")
    )
      writes.push(`${request.method()} ${url}`);
  });
  await setup(page);
  await startTour(page);
  for (let i = 0; i < 30 && (await card(page).count()) > 0; i++) {
    await nextButton(page).click();
    await page.waitForTimeout(120);
  }
  await expect(card(page)).toHaveCount(0);
  expect(writes).toEqual([]);
});

test("the tour visits My work's week and its overdue list, on My work", async ({ loggedInPage: page }) => {
  // Why: the Tutorial must describe the page people actually land on. The two My work steps point at the agenda and the overdue card, so they
  // need something assigned to be on screen; the tour goes to `/` for them by itself.
  const { projectId, issueIds } = await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: ["Mine to tour"] });
  const login = await page.request.post("/api/v1/auth/login", { data: { email: TEST_USER.email, password: TEST_USER.password } });
  const { accessToken, user, organization } = await login.json();
  const assigned = await page.request.patch(`/api/v1/organizations/${organization.id}/projects/${projectId}/issues/${issueIds[0]}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { version: 1, assigneeId: user.id },
  });
  expect(assigned.status()).toBe(200);

  await page.goto("/projects/WEB");
  await expect(page.getByRole("button", { name: /New issue/ })).toBeVisible();
  await startTour(page);
  await advanceTo(page, "Your week");
  await expect(page).toHaveURL(/\/$/);
  await expect(spot(page)).toHaveCount(1);
  await expect(card(page)).toContainText("Click an issue to open it beside the page");
  await nextButton(page).click();
  await expect(title(page)).toHaveText("What needs you");
  await expect(spot(page)).toHaveCount(1);
});

test("the tour explains MCP: the sidebar pill, then the Access tokens section on the account page", async ({ loggedInPage: page }) => {
  // Why: the MCP feature is invisible unless the tutorial points at it. The pill is in the sidebar; the setup lives on the account page, which
  // the tour has to open by itself and highlight the right section on (ADR 0071).
  await setup(page);
  await startTour(page);
  await advanceTo(page, "Use it from an AI app");
  await expect(spot(page)).toHaveCount(1);
  await expect(card(page)).toContainText("green while one is using your access token");
  const pill = (await page.locator('[data-tour="mcp-status"]').boundingBox())!;
  await expect.poll(async () => Math.round((await spot(page).boundingBox())?.x ?? -999)).toBe(Math.round(pill.x - 6));

  await nextButton(page).click();
  await expect(title(page)).toHaveText("Access tokens");
  await expect(page).toHaveURL(/\/account$/);
  await expect(spot(page)).toHaveCount(1);
  await expect(card(page)).toContainText("Press the ? beside the title");
  const section = (await page.locator('[data-tour="access-tokens"]').boundingBox())!;
  const highlight = (await spot(page).boundingBox())!;
  expect(Math.abs(highlight.x - (section.x - 6))).toBeLessThan(3);
});
