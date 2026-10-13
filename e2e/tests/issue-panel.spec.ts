import type { Page } from "@playwright/test";
import { test, expect, logInThroughForm } from "../support/fixtures";
import { createIssueViaApi } from "../support/api";
import { addOrgMember } from "../support/db";
import { makePng } from "../support/png";
import { combobox } from "../support/dropdown";

const panelOf = (page: Page) => page.getByRole("dialog", { name: "Issue", exact: true });
const cardLink = (page: Page, title: string) => page.getByRole("link", { name: new RegExp(title) });

async function setup(page: Page, titles = ["Alpha issue", "Beta issue"]) {
  const { projectId, issueIds } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles,
  });
  return { projectId, issueIds, listUrl: `/projects/${projectId}` };
}

test("clicking an issue opens it in a panel with the key, a full-page link and a close button; Esc closes it and focus returns", async ({
  loggedInPage: page,
}) => {
  // Why: the heart of the feature. The panel must show the real issue, put it in the URL
  // (?issue=), offer the full page, and close cleanly with focus back on the card.
  const { listUrl } = await setup(page);
  await page.goto(listUrl);
  const link = cardLink(page, "Alpha issue");
  await link.click();

  const panel = panelOf(page);
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("WEB-1");
  await expect(panel.getByRole("heading", { level: 2, name: "Alpha issue" })).toBeVisible();
  await expect(page).toHaveURL(/\?issue=WEB-1$/);
  await expect(page.getByRole("link", { name: /Alpha issue/ }).first()).toBeVisible(); // the list is still there
  await expect(panel.getByRole("link", { name: /Open full page/ })).toHaveAttribute(
    "href",
    "/projects/WEB/issues/WEB-1",
  );
  await expect(panel.getByRole("button", { name: "Close panel" })).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(page).toHaveURL(/\/projects\/WEB$/);
  await expect(link).toBeFocused();
});

test("clicking another issue swaps the panel; Back closes it instead of walking through every issue", async ({
  loggedInPage: page,
}) => {
  // Why: the owner asked that another card swaps the panel. History: the first open adds
  // an entry, a swap replaces it, so one Back returns to the list.
  const { listUrl } = await setup(page);
  await page.goto(listUrl);
  await cardLink(page, "Alpha issue").click();
  await expect(panelOf(page).getByRole("heading", { level: 2, name: "Alpha issue" })).toBeVisible();

  await cardLink(page, "Beta issue").click();
  await expect(panelOf(page).getByRole("heading", { level: 2, name: "Beta issue" })).toBeVisible();
  await expect(page).toHaveURL(/\?issue=WEB-2$/);
  await expect(panelOf(page)).toHaveCount(1);

  await page.goBack();
  await expect(panelOf(page)).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/projects/[^/?]+$`));
});

test("pressing the empty page closes the panel; pressing inside it, or typing in it, does not", async ({
  loggedInPage: page,
}) => {
  // Why: the owner's rule: another card swaps it, anywhere else closes it. Inside the panel
  // must never close it, and a comment can be posted from the panel.
  const { listUrl } = await setup(page);
  await page.goto(listUrl);
  await cardLink(page, "Alpha issue").click();
  const panel = panelOf(page);
  await expect(panel).toBeVisible();

  await panel.getByRole("heading", { level: 2, name: "Alpha issue" }).click();
  await page.waitForTimeout(150);
  await expect(panel).toBeVisible();

  await panel.getByRole("textbox", { name: "Comment", exact: true }).fill("Written inside the panel");
  await panel.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(panel.getByText("Written inside the panel")).toBeVisible();
  await expect(panel).toBeVisible();

  // The empty left of the page (the area beside the list): outside.
  await page.mouse.click(260, 560);
  await expect(panel).toHaveCount(0);
});

test("opening an issue does not narrow or move the list or the toolbar: the panel overlays them", async ({ loggedInPage: page }) => {
  // Why: the owner does not want the table to shrink when an issue opens (2026-10-14, ADR 0073). The old rule made the list stack into its
  // phone layout under 1560px. Measured at two window widths: the list and the toolbar keep their position and width, and the panel
  // really does sit over their right-hand end.
  const { listUrl } = await setup(page);
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(listUrl);
    const list = page.getByRole("region", { name: "Todo issues" });
    const toolbar = page.locator('[data-tour="issue-filters"]');
    await expect(list).toBeVisible();
    const before = { list: (await list.boundingBox())!, toolbar: (await toolbar.boundingBox())! };

    await cardLink(page, "Alpha issue").click();
    await expect(panelOf(page)).toBeVisible();
    await page.waitForTimeout(400); // past the panel's slide-in
    const after = { list: (await list.boundingBox())!, toolbar: (await toolbar.boundingBox())! };
    expect(Math.round(after.list.x)).toBe(Math.round(before.list.x));
    expect(Math.round(after.list.width)).toBe(Math.round(before.list.width));
    expect(Math.round(after.toolbar.x)).toBe(Math.round(before.toolbar.x));
    expect(Math.round(after.toolbar.width)).toBe(Math.round(before.toolbar.width));

    const panel = (await panelOf(page).boundingBox())!;
    expect(panel.x).toBeLessThan(after.list.x + after.list.width); // it overlays the list's right-hand end
    await page.keyboard.press("Escape");
    await expect(panelOf(page)).toHaveCount(0);
  }
});

test("a click outside that lands on a link still works while the panel closes; changing the sort with the panel open keeps it open and in the URL", async ({
  loggedInPage: page,
}) => {
  // Why: (1) the outside click must not be swallowed: a sidebar link must still navigate.
  // (2) The panel's ?issue= and the list's own parameters must not wipe each other. The controls are driven from the keyboard here, because
  // under about 1560px the panel now covers the toolbar's right-hand end (ADR 0073): a pointer would land on the panel instead.
  const { listUrl } = await setup(page);
  await page.goto(`${listUrl}?status=todo`);
  await cardLink(page, "Alpha issue").click();
  await expect(panelOf(page)).toBeVisible();

  const sort = combobox(page, "Sort");
  await sort.focus();
  await page.keyboard.press("ArrowDown"); // opens (the list floats above the panel)
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown"); // Highest priority first
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/sort=priority/);
  await expect(page).toHaveURL(/status=todo/);
  await expect(page).toHaveURL(/issue=WEB-1/); // still open
  await expect(panelOf(page)).toBeVisible();

  // A real click on a link outside the panel (the Board tab).
  await page.getByRole("navigation", { name: "View" }).getByRole("link", { name: "Board" }).click();
  await expect(page).toHaveURL(/\/board$/); // the link worked
  await expect(panelOf(page)).toHaveCount(0); // and the panel is gone
});

test("a reload keeps the panel open, the full-page link goes to the issue page, and a Ctrl+click is left to the browser", async ({
  loggedInPage: page,
}) => {
  // Why: the URL is the source of truth, and a modified click must keep its normal meaning.
  const { listUrl } = await setup(page);
  await page.goto(listUrl);
  await cardLink(page, "Alpha issue").click();
  await expect(panelOf(page)).toBeVisible();
  await page.reload();
  await expect(panelOf(page).getByRole("heading", { level: 2, name: "Alpha issue" })).toBeVisible();

  await panelOf(page).getByRole("link", { name: /Open full page/ }).click();
  await expect(page).toHaveURL(/\/projects\/WEB\/issues\/WEB-1$/);
  await expect(page.getByRole("heading", { level: 1, name: "Alpha issue" })).toBeVisible();
  await expect(panelOf(page)).toHaveCount(0);

  // A modified click must keep the browser's own meaning (a new tab). Whether the browser then opens that tab is the browser's business, and on
  // CI (Linux, headless) it was unreliable: the tab sometimes never appeared, sometimes had an empty address. What is OURS to get right is that
  // the app does not take the click over: it must not cancel the browser's default action and must not open the panel. So: a listener on
  // `document` (it runs after the app's own handlers) records whether the click was already cancelled, then cancels it itself so no real tab opens.
  await page.goto(listUrl);
  await expect(cardLink(page, "Beta issue")).toBeVisible();
  await page.evaluate(() => {
    const w = window as unknown as { __modifiedClick?: { cancelledByApp: boolean; ctrl: boolean } };
    document.addEventListener(
      "click",
      (event) => {
        w.__modifiedClick = { cancelledByApp: event.defaultPrevented, ctrl: event.ctrlKey };
        event.preventDefault(); // after reading it: keep the test browser on this page
      },
      { once: true },
    );
  });
  await cardLink(page, "Beta issue").click({ modifiers: ["Control"] });
  const seen = await page.evaluate(() => (window as unknown as { __modifiedClick?: { cancelledByApp: boolean; ctrl: boolean } }).__modifiedClick);
  expect(seen, "the click reached the page").toEqual({ cancelledByApp: false, ctrl: true });
  await expect(page).not.toHaveURL(/issue=/); // the panel was not opened by it
  await expect(panelOf(page)).toHaveCount(0);
});

test("an id that does not exist shows 'Issue not found' inside the panel, which can still be closed", async ({
  loggedInPage: page,
}) => {
  const { listUrl } = await setup(page);
  await page.goto(`${listUrl}?issue=00000000-0000-4000-8000-000000000000`);
  const panel = panelOf(page);
  await expect(panel.getByText("Issue not found.")).toBeVisible();
  await panel.getByRole("button", { name: "Close panel" }).click();
  await expect(panel).toHaveCount(0);
});

test("on the board a click opens the panel, but finishing a drag does not", async ({
  loggedInPage: page,
}) => {
  // Why: the board cards are draggable from anywhere and are links; the drag-click guard
  // must keep a drop from opening the panel (the bug ADR 0018 fixed for navigation).
  const { projectId } = await setup(page, ["Drag me", "Other"]);
  await page.goto(`/projects/${projectId}/board`);
  const column = (name: string) => page.getByRole("group", { name, exact: true });
  const card = column("Todo").getByRole("listitem").filter({ hasText: "Drag me" });
  const from = (await card.boundingBox())!;
  const to = (await column("In progress").boundingBox())!;

  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + 120, { steps: 20 });
  await page.mouse.up();
  await expect(column("In progress")).toContainText("Drag me");
  await page.waitForTimeout(400);
  await expect(panelOf(page)).toHaveCount(0);
  await expect(page).not.toHaveURL(/issue=/);

  await cardLink(page, "Drag me").click();
  await expect(panelOf(page).getByRole("heading", { level: 2, name: "Drag me" })).toBeVisible();
  await expect(page).toHaveURL(/\/board\?issue=/);
});

test("on the sprints page a backlog issue opens in the panel", async ({ loggedInPage: page }) => {
  const { projectId } = await setup(page, ["Backlog item"]);
  await page.goto(`/projects/${projectId}/sprints`);
  await cardLink(page, "Backlog item").click();
  await expect(panelOf(page).getByRole("heading", { level: 2, name: "Backlog item" })).toBeVisible();
  await expect(page).toHaveURL(/\/sprints\?issue=/);
});

test("deleting the issue from the panel closes it and says so; the card is gone", async ({
  loggedInPage: page,
}) => {
  const { listUrl } = await setup(page, ["Doomed", "Survivor"]);
  await page.goto(listUrl);
  await cardLink(page, "Doomed").click();
  const panel = panelOf(page);
  await panel.getByRole("button", { name: "Delete issue" }).click();
  await panel.getByRole("alertdialog").getByRole("button", { name: "Delete issue" }).click();

  await expect(panel).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText("This issue was deleted.");
  await expect(page.getByRole("link", { name: /Doomed/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Survivor/ })).toBeVisible();
});

test("a comment from another person shows up live in the open panel", async ({
  loggedInPage: page,
  browser,
}) => {
  // Why: the panel reuses the issue's live updates; a second real user proves it.
  const { listUrl, issueIds, projectId } = await setup(page);
  await addOrgMember("e2e-user@example.com", { email: "e2e-second@example.com", name: "Second Person" });
  await page.goto(listUrl);
  await cardLink(page, "Alpha issue").click();
  await expect(panelOf(page)).toBeVisible();

  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await logInThroughForm(other, "e2e-second@example.com");
  await other.goto(`/projects/${projectId}/issues/${issueIds[0]}`);
  await other.getByRole("textbox", { name: "Comment", exact: true }).fill("Hello from Second");
  await other.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(other.getByText("Hello from Second")).toBeVisible();

  await expect(panelOf(page).getByText("Hello from Second")).toBeVisible();
  await expect(panelOf(page).getByText("Second Person is also viewing")).toHaveCount(0); // they left no presence here
  await ctx.close();
});

test("Esc inside an image preview closes only the preview, not the panel; pressing the preview does not close the panel", async ({
  loggedInPage: page,
}) => {
  // Why: the panel listens for Esc and outside presses; a native dialog opened from inside
  // it must get its own Esc and its own clicks first.
  const { listUrl } = await setup(page);
  await page.goto(listUrl);
  await cardLink(page, "Alpha issue").click();
  const panel = panelOf(page);
  await expect(panel.getByRole("textbox", { name: "Comment", exact: true })).toBeVisible(); // content loaded
  await panel.evaluate((_, base64) => {
    const input = document.querySelector('input[aria-label="Attach files to comment"]') as HTMLInputElement;
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], "shot.png", { type: "image/png" }));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, makePng(400, 300).toString("base64"));
  await panel.getByRole("textbox", { name: "Comment", exact: true }).fill("With a picture");
  await panel.getByRole("button", { name: "Comment", exact: true }).click();
  await panel.getByRole("link", { name: "Preview shot.png" }).click();
  const preview = page.getByRole("dialog", { name: "Preview of shot.png" });
  await expect(preview).toBeVisible();

  await preview.getByRole("button", { name: "Zoom in" }).click(); // a press inside the preview
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(preview).toHaveCount(0);
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
});

test("on a phone-sized screen the panel fills the screen and can be closed", async ({
  loggedInPage: page,
}) => {
  const { listUrl } = await setup(page);
  await page.setViewportSize({ width: 400, height: 760 });
  await page.goto(listUrl);
  await cardLink(page, "Alpha issue").click();
  const panel = panelOf(page);
  await expect(panel).toBeVisible();
  const box = (await panel.boundingBox())!;
  expect(Math.round(box.x)).toBe(0);
  expect(Math.round(box.width)).toBe(400);
  expect(Math.round(box.height)).toBe(760);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await panel.getByRole("button", { name: "Close panel" }).click();
  await expect(panel).toHaveCount(0);
});

test("the panel never scrolls sideways, and an uploader's hover card opens inside the panel", async ({
  loggedInPage: page,
}) => {
  // Why: hover cards are hidden until hovered, but a hidden card that sticks out past the
  // panel still widens its scrollable area. A name at the right end of the attachments row
  // would add a horizontal scrollbar to the panel (found by eye in the real app).
  const { listUrl } = await setup(page);
  await page.goto(listUrl);
  await cardLink(page, "Alpha issue").click();
  const panel = panelOf(page);
  await expect(panel.getByRole("textbox", { name: "Comment", exact: true })).toBeVisible(); // content loaded
  await page.evaluate(() => {
    const input = document.querySelector('input[aria-label="Attach files to comment"]') as HTMLInputElement;
    const dt = new DataTransfer();
    dt.items.add(new File(["hello"], "notes.txt", { type: "text/plain" }));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await panel.getByRole("textbox", { name: "Comment", exact: true }).fill("With a file");
  await panel.getByRole("button", { name: "Comment", exact: true }).click();
  const row = panel.getByRole("listitem").filter({ hasText: "notes.txt" }).filter({
    has: page.getByRole("button", { name: "Remove" }),
  });
  await expect(row).toBeVisible();

  const body = panel.locator("div.overflow-y-auto");
  expect(await body.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);

  await row.getByRole("link", { name: "E2E User" }).hover();
  const card = page.locator('[role="tooltip"]:visible');
  await expect(card).toHaveCount(1);
  const cardBox = (await card.boundingBox())!;
  const panelBox = (await panel.boundingBox())!;
  expect(cardBox.x).toBeGreaterThanOrEqual(panelBox.x);
  expect(cardBox.x + cardBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width);
});

for (const scheme of ["light", "dark"] as const) {
  test(`in the panel the attachment cards stand out from the background (${scheme})`, async ({ loggedInPage: page }) => {
    // Why: the panel body used the same colour as the cards inside it, so in dark mode (where
    // the cards' small shadow is invisible) the attachments blended into the panel. The body
    // now uses the page colour, like the full page. Measured, not eyeballed.
    await page.emulateMedia({ colorScheme: scheme });
    const { listUrl } = await setup(page);
    await page.goto(listUrl);
    await cardLink(page, "Alpha issue").click();
    const panel = panelOf(page);
    await expect(panel.getByRole("textbox", { name: "Comment", exact: true })).toBeVisible();
    await page.evaluate(() => {
      const input = document.querySelector('input[aria-label="Attach files to comment"]') as HTMLInputElement;
      const dt = new DataTransfer();
      dt.items.add(new File(["hello"], "notes.txt", { type: "text/plain" }));
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await panel.getByRole("textbox", { name: "Comment", exact: true }).fill("With a file");
    await panel.getByRole("button", { name: "Comment", exact: true }).click();
    const row = panel.getByRole("listitem").filter({ hasText: "notes.txt" }).filter({
      has: page.getByRole("button", { name: "Remove" }),
    });
    await expect(row).toBeVisible();

    const colours = {
      card: await row.evaluate((el) => getComputedStyle(el).backgroundColor),
      body: await panel.locator("div.overflow-y-auto").evaluate((el) => getComputedStyle(el).backgroundColor),
    };
    expect(colours.card).not.toBe(colours.body);
  });
}

test("selecting text in the panel and letting go of the mouse outside it does not close the panel", async ({ loggedInPage: page }) => {
  // Why: dragging a text selection out of the comment box and releasing over the page used to count as a click outside and closed the panel,
  // throwing away what was being written. Only a press that STARTS outside the panel is a click outside.
  const { listUrl } = await setup(page);
  await page.goto(listUrl);
  await cardLink(page, "Alpha issue").click();
  const panel = panelOf(page);
  const box = panel.getByRole("textbox", { name: "Comment", exact: true });
  await box.fill("Some words to select");

  const area = (await box.boundingBox())!;
  await page.mouse.move(area.x + area.width - 20, area.y + 40);
  await page.mouse.down();
  await page.mouse.move(area.x - 150, area.y + 40, { steps: 8 });
  await page.mouse.move(60, 500, { steps: 8 }); // over the page's left side, well outside the panel
  await page.mouse.up();

  await expect(panel).toBeVisible();
  await expect(page).toHaveURL(/\?issue=WEB-1$/);
  await expect(box).toContainText("Some words to select");

  // A plain click on the page, pressed and released outside, still closes it.
  await page.mouse.click(60, 500);
  await expect(panel).toHaveCount(0);
});
