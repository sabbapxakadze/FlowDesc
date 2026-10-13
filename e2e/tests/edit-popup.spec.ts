import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { apiSession, createIssueViaApi } from "../support/api";
import { pick } from "../support/dropdown";

/**
 * Editing an issue happens in a popup (a native modal dialog) from the issue list, the issue page and the side
 * panel. With the side panel open the popup appears on top of it.
 */

const dialogOf = (page: Page, key = "WEB-1") => page.getByRole("dialog", { name: `Edit ${key}` });
const panelOf = (page: Page) => page.locator('section[aria-label="Issue"]');
const row = (page: Page, title: string) => page.getByRole("listitem").filter({ hasText: title });

async function setup(page: Page, titles = ["Alpha", "Beta"]) {
  return createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles });
}

test("Edit on a list row opens a popup, Save updates the row, and focus goes back to the Edit button", async ({
  loggedInPage: page,
}) => {
  // Why: the main flow. The row used to turn into a form inside the list.
  await setup(page);
  await page.goto("/projects/WEB");
  const edit = row(page, "Alpha").getByRole("button", { name: "Edit" });
  await edit.click();
  const dialog = dialogOf(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Title")).toBeFocused(); // starts in the first field
  await dialog.getByLabel("Title").fill("Alpha renamed");
  await pick(dialog.getByRole("combobox", { name: /priority/i }), "High");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row(page, "Alpha renamed").getByRole("img", { name: "High priority" })).toBeVisible();
  await expect(edit).toBeFocused();
});

test("with the side panel open, the popup appears on top and Esc closes only the popup", async ({
  loggedInPage: page,
}) => {
  // Why: the owner asked what happens with a second issue already open. A native modal dialog sits above the
  // panel; the panel stays open and keeps its issue.
  await setup(page);
  await page.goto("/projects/WEB?issue=WEB-2");
  const panel = panelOf(page);
  await expect(panel.getByRole("heading", { level: 2, name: "Beta" })).toBeVisible();

  await panel.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = dialogOf(page, "WEB-2");
  await expect(dialog).toBeVisible();
  // The dialog is the modal one, so the panel behind cannot be clicked.
  expect(await dialog.evaluate((el) => el.matches(":modal"))).toBe(true);

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(panel).toBeVisible(); // Esc went to the popup, not the panel
  await expect(page).toHaveURL(/issue=WEB-2/);
});

test("the issue page edits in the same popup, and a description keeps its line breaks", async ({
  loggedInPage: page,
}) => {
  // Why: one editor everywhere; the description is a multi-line box now, so the page must show its lines.
  await setup(page);
  await page.goto("/projects/WEB/issues/WEB-1");
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const dialog = dialogOf(page);
  await dialog.getByLabel("Description").click();
  await page.keyboard.type("Line one");
  await page.keyboard.press("Shift+Enter"); // a line break inside the paragraph (Enter alone starts a new paragraph)
  await page.keyboard.type("Line two");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);
  const text = page.getByText("Line one");
  await expect(text).toBeVisible();
  expect(await text.evaluate((el) => getComputedStyle(el).whiteSpace)).toBe("pre-wrap");
});

test("a click on the dimmed area closes the popup, unless there is unsaved text; Esc always closes it", async ({
  loggedInPage: page,
}) => {
  // Why: a stray click must not throw a half-written edit away.
  await setup(page);
  await page.goto("/projects/WEB");
  const open = () => row(page, "Alpha").getByRole("button", { name: "Edit" }).click();
  const dialog = dialogOf(page);
  const clickBackdrop = () => page.mouse.click(5, 5);

  await open();
  await expect(dialog).toBeVisible();
  await clickBackdrop();
  await expect(dialog).toHaveCount(0); // nothing typed: it closes

  await open();
  await dialog.getByLabel("Title").fill("Half written");
  await clickBackdrop();
  await expect(dialog).toBeVisible(); // typed: it stays
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(row(page, "Alpha")).toBeVisible(); // nothing was saved
});

test("saving over a change made elsewhere closes the popup and says the issue was updated", async ({
  loggedInPage: page,
}) => {
  // Why: the version check (409) must still end in the existing notice, now from inside a popup.
  const { projectId, issueIds } = await setup(page);
  await page.goto("/projects/WEB");
  await row(page, "Alpha").getByRole("button", { name: "Edit" }).click();
  const dialog = dialogOf(page);
  await expect(dialog).toBeVisible();

  const { headers, base } = await apiSession(page.request);
  const other = await page.request.patch(`${base}/projects/${projectId}/issues/${issueIds[0]}`, {
    headers,
    data: { version: 1, title: "Changed elsewhere" },
  });
  expect(other.status()).toBe(200);
  // The live update would normally hand the form the new version before Save; send the stale one on purpose,
  // as a person whose screen has not caught up yet would.
  await page.route("**/issues/*", async (route) => {
    const request = route.request();
    if (request.method() !== "PATCH") return route.fallback();
    const body = JSON.parse(request.postData() ?? "{}");
    await route.continue({ postData: JSON.stringify({ ...body, version: 1 }) });
  });

  await dialog.getByLabel("Title").fill("My version");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(/updated by someone else/)).toBeVisible();
});

test("when someone else changes the issue while the popup is open, a banner says what changed and that Save will overwrite it", async ({
  loggedInPage: page,
}) => {
  // Why: Save resends the values the popup opened with, so it silently overwrote a change made in the meantime (proven
  // 2026-10-05). The owner chose to warn (nothing is merged): the banner names the fields and the consequence.
  const { projectId, issueIds } = await setup(page);
  await page.goto("/projects/WEB");
  await row(page, "Alpha").getByRole("button", { name: "Edit" }).click();
  const dialog = dialogOf(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("status")).toHaveCount(0); // nothing changed yet: no banner

  const { headers, base } = await apiSession(page.request);
  const other = await page.request.patch(`${base}/projects/${projectId}/issues/${issueIds[0]}`, {
    headers,
    data: { version: 1, title: "Changed elsewhere", status: "done" },
  });
  expect(other.status()).toBe(200);

  const banner = dialog.getByRole("status");
  await expect(banner).toContainText("Someone changed this issue while you were editing");
  await expect(banner).toContainText("title, status");
  await expect(banner).toContainText("Saving will overwrite their change");
  await expect(banner).not.toContainText("priority"); // only what really changed
});
