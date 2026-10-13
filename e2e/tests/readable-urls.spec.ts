import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { createIssueViaApi } from "../support/api";

/**
 * Readable addresses (ADR 0030): projects and issues are named by their keys in the address bar
 * (/projects/WEB, /projects/WEB/issues/WEB-1, /projects/WEB?issue=WEB-1), old addresses that carry
 * database ids still work and are rewritten, and unknown keys say "not found".
 */

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const panelOf = (page: Page) => page.locator('section[aria-label="Issue"]');

async function setup(page: Page) {
  const { projectId, issueIds } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["Alpha", "Beta"],
  });
  return { projectId, issueId: issueIds[0]!, secondIssueId: issueIds[1]! };
}

test("every project page opens by key, and the address stays readable", async ({ loggedInPage: page }) => {
  // Why: the project key replaces the id in every project address.
  await setup(page);
  for (const [path, heading] of [
    ["/projects/WEB", "Issues"],
    ["/projects/WEB/board", "Board"],
    ["/projects/WEB/sprints", "Sprints"],
    ["/projects/WEB/analytics", "Analytics"],
    ["/projects/WEB/settings", "Settings"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1, name: heading })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(path);
  }

  // Moving with the sidebar keeps it readable too.
  await page.goto("/projects/WEB");
  const nav = page.getByRole("navigation", { name: "Main" });
  await page.getByRole("navigation", { name: "View" }).getByRole("link", { name: "Board" }).click();
  await expect(page).toHaveURL(/\/projects\/WEB\/board$/);
  await nav.getByRole("link", { name: "Sprints" }).click();
  await expect(page).toHaveURL(/\/projects\/WEB\/sprints$/);
});

test("the side panel is ?issue=WEB-1 and survives a reload; Open full page is /projects/WEB/issues/WEB-1", async ({
  loggedInPage: page,
}) => {
  await setup(page);
  await page.goto("/projects/WEB");
  await page.getByRole("link", { name: /Alpha/ }).first().click();
  await expect(panelOf(page).getByRole("heading", { level: 2, name: "Alpha" })).toBeVisible();
  await expect(page).toHaveURL(/\/projects\/WEB\?issue=WEB-1$/);

  // The list's filters live next to it, in the same address.
  await page.getByRole("group", { name: "Status" }).getByRole("button", { name: /^Todo/ }).click();
  await expect(page).toHaveURL(/status=todo/);
  await expect(page).toHaveURL(/issue=WEB-1/);

  await page.reload();
  await expect(panelOf(page).getByRole("heading", { level: 2, name: "Alpha" })).toBeVisible();

  await panelOf(page).getByRole("link", { name: /Open full page/ }).click();
  await expect(page).toHaveURL(/\/projects\/WEB\/issues\/WEB-1$/);
  await expect(page.getByRole("heading", { level: 1, name: "Alpha" })).toBeVisible();
});

test("old addresses with ids still open and are rewritten to the readable form", async ({ loggedInPage: page }) => {
  // Why: links shared or bookmarked before this change must keep working.
  const { projectId, issueId } = await setup(page);

  await page.goto(`/projects/${projectId}`);
  await expect(page).toHaveURL(/\/projects\/WEB$/);
  await expect(page.getByRole("heading", { level: 1, name: "Issues" })).toBeVisible();

  await page.goto(`/projects/${projectId}/issues/${issueId}`);
  await expect(page).toHaveURL(/\/projects\/WEB\/issues\/WEB-1$/);
  await expect(page.getByRole("heading", { level: 1, name: "Alpha" })).toBeVisible();

  await page.goto(`/projects/${projectId}/board?issue=${issueId}`);
  await expect(page).toHaveURL(/\/projects\/WEB\/board\?issue=WEB-1$/);
  await expect(panelOf(page).getByRole("heading", { level: 2, name: "Alpha" })).toBeVisible();

  // Lower case is accepted and written back in capitals.
  await page.goto("/projects/web/issues/web-2");
  await expect(page).toHaveURL(/\/projects\/WEB\/issues\/WEB-2$/);
  await expect(page.getByRole("heading", { level: 1, name: "Beta" })).toBeVisible();
});

test("an unknown project, issue number or key says not found, in the page and in the panel", async ({
  loggedInPage: page,
}) => {
  await setup(page);

  await page.goto("/projects/NOPE");
  await expect(page.getByRole("heading", { name: "Project not found" })).toBeVisible();

  for (const path of ["/projects/WEB/issues/WEB-99", "/projects/WEB/issues/API-1", "/projects/WEB/issues/nonsense"]) {
    await page.goto(path);
    await expect(page.getByText("Issue not found.")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(path); // not rewritten into something else
  }

  await page.goto("/projects/WEB?issue=WEB-99");
  await expect(panelOf(page).getByText("Issue not found.")).toBeVisible();
  await panelOf(page).getByRole("button", { name: "Close panel" }).click();
  await expect(panelOf(page)).toHaveCount(0);
  await expect(page).not.toHaveURL(/issue=/);
});

test("no link in the app carries a database id: lists, board, sprints, sidebar", async ({ loggedInPage: page }) => {
  // Why: the guard against one forgotten link built from an id (the whole point is readable addresses).
  await setup(page);
  for (const path of ["/projects", "/projects/WEB", "/projects/WEB/board", "/projects/WEB/sprints"]) {
    await page.goto(path);
    await expect(page.getByRole("link", { name: /Website|Alpha/ }).first()).toBeVisible();
    const hrefs = await page.locator("a[href]").evaluateAll((links) => links.map((a) => a.getAttribute("href") ?? ""));
    const withIds = hrefs.filter((href) => UUID.test(href) && !href.startsWith("/api/"));
    expect(withIds, `${path}: links that still carry an id`).toEqual([]);
  }
});

test("the search palette goes to the readable address", async ({ loggedInPage: page }) => {
  await setup(page);
  await page.goto("/projects");
  // The shortcut is only listening once the session is loaded (the project list is on screen).
  await expect(page.getByRole("link", { name: /Website/ }).first()).toBeVisible();
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox").fill("Alpha");
  await page.getByRole("option", { name: /WEB-1/ }).click();
  await expect(page).toHaveURL(/\/projects\/WEB\/issues\/WEB-1$/);
});
