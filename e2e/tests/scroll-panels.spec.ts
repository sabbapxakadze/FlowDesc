import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { apiSession, createIssueViaApi } from "../support/api";

/**
 * "Load more" grows a list inside its own scrolling panel and never stretches the page: the issues list and a
 * person's Recent activity. A long issue timeline on the full page scrolls inside its own area too. Measured in the browser (scroll heights), at a desktop window size.
 */

test.use({ viewport: { width: 1280, height: 800 } });

const pageHeight = (page: Page) => page.evaluate(() => document.documentElement.scrollHeight);
const panelOf = (page: Page, name: string) => page.getByRole("group", { name });

async function metrics(page: Page, name: string) {
  return panelOf(page, name).evaluate((el) => ({ scroll: el.scrollHeight, client: el.clientHeight }));
}

test("issues: Load more fills the panel, the page keeps its height", async ({ loggedInPage: page }) => {
  // Why: the page used to grow with every Load more; the list must scroll inside its own panel instead.
  const titles = Array.from({ length: 32 }, (_, i) => `Issue ${String(i + 1).padStart(2, "0")}`);
  await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles });
  await page.goto("/projects/WEB");
  const panel = panelOf(page, "Issue list");
  await expect(panel.getByRole("link", { name: /Issue 32/ })).toBeVisible();

  const before = await pageHeight(page);
  expect(before).toBeLessThanOrEqual(800 + 1); // the page itself does not scroll
  const first = await metrics(page, "Issue list");
  expect(first.scroll).toBeGreaterThan(first.client); // 25 rows already scroll inside the panel

  await panel.getByRole("button", { name: "Load more" }).click();
  await expect(panel.getByRole("link", { name: /Issue 01/ })).toHaveCount(1);
  expect(await pageHeight(page)).toBe(before);
  const after = await metrics(page, "Issue list");
  expect(after.scroll).toBeGreaterThan(first.scroll); // the new rows went inside
  expect(after.client).toBe(first.client);
});

test("profile: Load more fills the activity panel, the page keeps its height", async ({ loggedInPage: page }) => {
  // Why: same stretching on a person's profile; the activity list is capped and scrolls inside.
  const titles = Array.from({ length: 32 }, (_, i) => `Issue ${String(i + 1).padStart(2, "0")}`);
  await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles });
  await page.setViewportSize({ width: 1280, height: 620 }); // short enough that the first page overflows the box
  await page.goto("/projects");
  await page.getByRole("link", { name: /E2E User/ }).first().click();
  await expect(page).toHaveURL(/\/profile$|\/people\//);
  if (/\/profile$/.test(page.url())) await page.getByRole("link", { name: /View profile/ }).click();
  const panel = panelOf(page, "Activity list");
  await expect(panel.getByRole("listitem").first()).toBeVisible();

  const first = await metrics(page, "Activity list");
  expect(first.client).toBeLessThanOrEqual(28 * 16 + 1); // capped at 28rem

  // Like the Issues list, the button is the last item of the list: out of sight at rest, in view once scrolled to the end.
  const loadMore = panel.getByRole("button", { name: "Load more" });
  const inside = async () => {
    const button = (await loadMore.boundingBox())!;
    const area = (await panel.boundingBox())!;
    return button.y >= area.y && button.y + button.height <= area.y + area.height + 0.5;
  };
  expect(await inside()).toBe(false);
  await panel.evaluate((el) => (el.scrollTop = el.scrollHeight));
  expect(await inside()).toBe(true);
  await panel.evaluate((el) => (el.scrollTop = 0));
  const before = await pageHeight(page);
  const rowsBefore = await panel.getByRole("listitem").count();

  await panel.getByRole("button", { name: "Load more" }).click();
  await expect.poll(() => panel.getByRole("listitem").count()).toBeGreaterThan(rowsBefore);
  expect(await pageHeight(page)).toBe(before);
  expect((await metrics(page, "Activity list")).client).toBe(first.client);
});

async function issueWithComments(page: Page, count: number) {
  const { projectId, issueIds } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["Long thread"],
  });
  const { headers, base } = await apiSession(page.request);
  for (let i = 1; i <= count; i++) {
    const res = await page.request.post(`${base}/projects/${projectId}/issues/${issueIds[0]}/comments`, {
      headers,
      data: { body: `Comment number ${i}` },
    });
    expect(res.status()).toBe(201);
  }
}

test("issue page: a long timeline scrolls inside its own area, the comment box stays above it", async ({
  loggedInPage: page,
}) => {
  // Why: a thread of dozens of comments stretched the page; the timeline is capped (40rem) and scrolls inside.
  await issueWithComments(page, 25);
  // A tall window: the properties and description cards above the timeline (ADR 0061) use some of the height.
  await page.setViewportSize({ width: 1280, height: 1400 });
  await page.goto("/projects/WEB/issues/WEB-1");
  const timeline = panelOf(page, "Activity timeline");
  await expect(timeline.getByText("Comment number 25")).toBeVisible(); // newest first, at the top
  const m = await metrics(page, "Activity timeline");
  expect(m.client).toBeLessThanOrEqual(40 * 16 + 1);
  expect(m.client).toBeGreaterThanOrEqual(28 * 16 - 1); // not squeezed to a sliver by the cards above it
  expect(m.scroll).toBeGreaterThan(m.client);
  // The bottom edge is on screen at rest, so the shadow and the scrollbar can show that it scrolls.
  const rest = (await timeline.boundingBox())!;
  expect(rest.y + rest.height).toBeLessThanOrEqual(1400);

  const box = (await page.getByRole("textbox", { name: "Comment", exact: true }).boundingBox())!;
  const area = (await timeline.boundingBox())!;
  expect(box.y).toBeLessThan(area.y); // the box is above the scrolling area, never inside it
  await page.getByRole("textbox", { name: "Comment", exact: true }).fill("Brand new");
  await page.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(timeline.getByText("Brand new")).toBeVisible(); // lands at the top of the area, in view
});

test("issue page: a short timeline keeps its own height", async ({ loggedInPage: page }) => {
  // Why: the cap must not stretch a short list (the same lesson as the board and the Issues list).
  await issueWithComments(page, 1);
  await page.goto("/projects/WEB/issues/WEB-1");
  const m = await metrics(page, "Activity timeline");
  expect(m.client).toBeLessThan(28 * 16);
  expect(m.scroll).toBeLessThanOrEqual(m.client + 1);
});

test("side panel: the timeline is not wrapped in a second scrolling area", async ({ loggedInPage: page }) => {
  // Why: the panel already scrolls as a whole; a scroll inside a scroll traps the mouse wheel.
  await issueWithComments(page, 3);
  await page.goto("/projects/WEB?issue=WEB-1");
  const side = page.locator('section[aria-label="Issue"]');
  await expect(side.getByText("Comment number 3")).toBeVisible();
  await expect(side.getByRole("group", { name: "Activity timeline" })).toHaveCount(0);
});

test("issue page: a person's hover card at the bottom of the timeline is not clipped, and a short timeline is not scrollable because of it", async ({
  loggedInPage: page,
}) => {
  // Why: the hover card used to be absolutely positioned, so inside the scrolling timeline it was cut off and,
  // even invisible, made a short timeline scrollable (a stray bottom shadow). It is now fixed to the screen.
  await issueWithComments(page, 25);
  await page.goto("/projects/WEB/issues/WEB-1");
  const timeline = panelOf(page, "Activity timeline");
  await expect(timeline.getByText("Comment number 25")).toBeVisible();
  await timeline.evaluate((el) => (el.scrollTop = el.scrollHeight));

  const last = timeline.getByRole("listitem").last();
  await last.getByRole("link", { name: "E2E User" }).first().hover();
  const card = page.getByRole("tooltip").filter({ hasText: "E2E User" }).last();
  await expect(card).toBeVisible();
  const box = (await card.boundingBox())!;
  // The card is fixed to the window, so the scrolling timeline cannot clip it. It opens below the name when there is room and above it when there
  // is not (a name near the bottom of the window), so this does not depend on which: it must be `fixed` and entirely on screen.
  expect(await card.evaluate((el) => getComputedStyle(el).position)).toBe("fixed");
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  const hit = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x!, y!)?.closest('[role="tooltip"]') !== null,
    [box.x + box.width / 2, box.y + box.height / 2],
  );
  expect(hit).toBe(true); // what is under the card's centre is the card, not a clipped edge
});
