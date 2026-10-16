import { test, expect } from "../support/fixtures";

/**
 * "Try the demo" (ADR 0044) in the browser: the landing page button, a private copy per visitor, the guided tour that opens by itself, the
 * bar that says the copy is deleted, and what happens when its time is up. The e2e API has the demo switched on (playwright.config.ts).
 * The rules the server enforces (limits, cap, clean-up, restrictions) are tested over HTTP in apps/api/src/modules/demo.
 */

const TOUR_CARD = "[data-tour-card]";

test("the demo bar has a get-in-touch link to the same address as the landing page, and fits a phone", async ({ page }) => {
  // Why: people inside the demo are the people the owner wants to hear from (ADR 0076). The link must go to the address the landing page shows,
  // not a copy that can drift, and the longer bar must not run off the side of a phone.
  await page.goto("/");
  const landingEmail = await page.getByRole("link", { name: /@/ }).first().getAttribute("href");
  await page.getByRole("button", { name: "Try the demo" }).first().click();
  const bar = page.getByTestId("demo-bar");
  await expect(bar).toContainText("This is a demo with sample data");
  const touch = bar.getByRole("link", { name: "Built by Saba. Get in touch" });
  await expect(touch).toHaveAttribute("href", /^mailto:[^?]+\?subject=FlowDesc%20demo$/);
  expect(await touch.getAttribute("href")).toContain(landingEmail!.replace("mailto:", ""));

  await page.setViewportSize({ width: 390, height: 844 });
  const box = await bar.boundingBox();
  const link = await touch.boundingBox();
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(link!.x + link!.width).toBeLessThanOrEqual(390 - 8); // inside the screen, with its padding
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("the landing page offers the demo and says it is deleted", async ({ page }) => {
  // Why: the button must be there (the server says the demo is on), and the visitor must be told up front that the copy does not last.
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Try the demo" }).first()).toBeVisible();
  await expect(page.getByTestId("demo-note").first()).toContainText("It is deleted after about 2 hours");
});

test("one click enters a private demo, opens the tour by itself and shows when the copy is deleted", async ({ page }) => {
  // Why: this is the whole feature. A visitor with no account lands signed in inside sample data, is shown around, and knows the copy is temporary.
  await page.goto("/");
  await page.getByRole("button", { name: "Try the demo" }).first().click();

  await expect(page.getByRole("heading", { level: 1, name: "My work" })).toBeVisible(); // in the app, signed in
  await expect(page.getByText(/^Good (morning|afternoon|evening), /)).toBeVisible();
  await expect(page.locator(TOUR_CARD)).toContainText("Welcome to FlowDesc"); // the guided tour started by itself
  const bar = page.getByTestId("demo-bar");
  await expect(bar).toContainText("This is a demo with sample data");
  await expect(bar).toContainText(/deleted at \d{1,2}:\d{2}/);
  await expect(bar).toContainText(/\((2 h|1 h 59 min) left\)/); // about two hours

  await page.keyboard.press("Escape"); // the tour closes; the bar stays
  await expect(page.locator(TOUR_CARD)).toHaveCount(0);
  await expect(bar).toBeVisible();

  // It really is the demo's sample data.
  await page.goto("/projects");
  await expect(page.getByText("Website Redesign").first()).toBeVisible();
});

test("two visitors get separate demos: what one adds, the other never sees", async ({ page, browser }) => {
  // Why: the reason for a copy per click. Visitors must not see or change each other's data.
  await page.goto("/");
  await page.getByRole("button", { name: "Try the demo" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "My work" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/projects/WEB");
  await page.getByRole("button", { name: "New issue" }).first().click();
  await page.getByLabel("Title").fill("Only visitor A");
  await page.getByRole("button", { name: "Add issue" }).click();
  await expect(page.getByRole("link", { name: /Only visitor A/ }).first()).toBeVisible();

  const second = await browser.newContext();
  const other = await second.newPage();
  await other.goto("/");
  await other.getByRole("button", { name: "Try the demo" }).first().click();
  await expect(other.getByRole("heading", { level: 1, name: "My work" })).toBeVisible();
  await other.keyboard.press("Escape");
  await other.goto("/projects/WEB");
  await expect(other.getByText("Newsletter signup form accepts invalid emails").first()).toBeVisible(); // the demo's data is there
  await expect(other.getByText("Only visitor A")).toHaveCount(0); // visitor A's issue is not
  await second.close();
});

test("when the copy's time is up the bar says so and offers a new demo", async ({ page }) => {
  test.setTimeout(90_000);
  // Why: the visitor must not be left guessing. The server's answer is made to say "ends in 4 seconds" so the test does not wait two hours;
  // the bar counts down on its own and, at the deadline, offers a fresh copy (which is a different organization with a new deadline).
  await page.route("**/api/v1/demo/start", async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    body.organization.demoExpiresAt = new Date(Date.now() + 4_000).toISOString();
    await route.fulfill({ response, json: body });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Try the demo" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "My work" })).toBeVisible();
  await page.keyboard.press("Escape");
  const bar = page.getByTestId("demo-bar");
  await expect(bar).toContainText("less than a minute left");

  await expect(bar).toContainText("This demo has ended", { timeout: 30_000 }); // the bar re-checks every 15 seconds
  await page.unroute("**/api/v1/demo/start"); // the next one is the server's real answer
  await bar.getByRole("button", { name: "Start a new demo" }).click();
  await expect(bar).toContainText(/\((2 h|1 h 59 min) left\)/, { timeout: 15_000 });
});

test("a real organization never shows the demo bar", async ({ loggedInPage: page }) => {
  // Why: the bar is only for demo copies; showing it to real people would tell them their data will be deleted.
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "My work" })).toBeVisible();
  await expect(page.getByTestId("demo-bar")).toHaveCount(0);
});
