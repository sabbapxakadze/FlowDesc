import type { APIRequestContext, Page } from "@playwright/test";
import { test, expect, TEST_USER } from "../support/fixtures";
import { apiSession, createIssueViaApi } from "../support/api";
import { combobox, editField, pick } from "../support/dropdown";

/**
 * The Issues list grouped by status (ADR 0072): In progress, Todo and Done (closed, and not even loaded until opened), a status tab for one
 * flat list, one-line rows, and the assignee always in the same right-most column, with or without a due date.
 */

const rowOf = (page: Page, title: string) => page.getByRole("listitem").filter({ hasText: title });
const sectionOf = (page: Page, name: string) => page.getByRole("region", { name: `${name} issues` });
const headerOf = (page: Page, name: RegExp) => page.getByRole("heading", { level: 2, name }).getByRole("button");

async function patchIssue(request: APIRequestContext, projectId: string, issueId: string, data: Record<string, unknown>) {
  const { headers, base } = await apiSession(request);
  const res = await request.patch(`${base}/projects/${projectId}/issues/${issueId}`, { headers, data: { version: 1, ...data } });
  expect(res.status()).toBe(200);
}

async function myId(request: APIRequestContext) {
  const login = await request.post("/api/v1/auth/login", { data: { email: TEST_USER.email, password: TEST_USER.password } });
  return (await login.json()).user.id as string;
}

/** Two in progress (one with a due date, one without), one waiting and unassigned, two finished. */
async function setup(page: Page) {
  const { projectId, issueIds } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["Moving A", "Moving B", "Waiting C", "Finished D", "Finished E"],
  });
  const me = await myId(page.request);
  const [a, b, , d, e] = issueIds as [string, string, string, string, string];
  await patchIssue(page.request, projectId, a, { status: "in_progress", assigneeId: me, dueDate: "2099-01-02" });
  await patchIssue(page.request, projectId, b, { status: "in_progress", assigneeId: me });
  await patchIssue(page.request, projectId, d, { status: "done", assigneeId: me });
  await patchIssue(page.request, projectId, e, { status: "done" });
  return { projectId, issueIds };
}

test("issues are grouped In progress, Todo, Done, with exact counts, and Done is closed", async ({ loggedInPage: page }) => {
  // Why: the shape of the page. What is moving comes first, finished work last and out of the way; the numbers come from the project summary.
  await setup(page);
  await page.goto("/projects/WEB");
  const headings = page.getByRole("heading", { level: 2 });
  await expect(headings.nth(0)).toHaveText(/In progress\s*2/);
  await expect(headings.nth(1)).toHaveText(/Todo\s*1/);
  await expect(headings.nth(2)).toHaveText(/Done\s*2/);
  await expect(headerOf(page, /Done/)).toHaveAttribute("aria-expanded", "false");
  await expect(rowOf(page, "Moving A")).toBeVisible();
  await expect(rowOf(page, "Waiting C")).toBeVisible();
  await expect(rowOf(page, "Finished D")).toHaveCount(0);

  const tabs = page.getByRole("group", { name: "Status" });
  await expect(tabs.getByRole("button", { name: /^All\s*5$/ })).toBeVisible();
  await expect(tabs.getByRole("button", { name: /^In progress\s*2$/ })).toBeVisible();
  await expect(tabs.getByRole("button", { name: /^Todo\s*1$/ })).toBeVisible();
  await expect(tabs.getByRole("button", { name: /^Done\s*2$/ })).toBeVisible();
});

test("the Done group loads nothing until it is opened, and opens from the keyboard", async ({ loggedInPage: page }) => {
  // Why: finished work is the biggest group by far. A closed group must cost no request (and the header is a real button, so it works without a mouse).
  await setup(page);
  const doneRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/issues") && request.url().includes("status=done")) doneRequests.push(request.url());
  });
  await page.goto("/projects/WEB");
  await expect(rowOf(page, "Moving A")).toBeVisible();
  await page.waitForTimeout(500);
  expect(doneRequests).toEqual([]);

  const header = headerOf(page, /Done/);
  await header.focus();
  await page.keyboard.press("Enter");
  await expect(header).toHaveAttribute("aria-expanded", "true");
  await expect(rowOf(page, "Finished D")).toBeVisible();
  await expect(rowOf(page, "Finished E")).toBeVisible();
  expect(doneRequests.length).toBeGreaterThan(0);

  await page.keyboard.press("Space"); // and closes again
  await expect(header).toHaveAttribute("aria-expanded", "false");
  await expect(rowOf(page, "Finished D")).toHaveCount(0);
});

test("the assignee is in the same right-most column in every row: with a due date, without one, and unassigned", async ({ loggedInPage: page }) => {
  // Why: the owner's requirement. A row without a due date used to let the next cell slide left; each cell now has its own column, so the
  // assignee circle (or the dashed one for nobody) sits at the same right edge whatever else the row has.
  await setup(page);
  await page.goto("/projects/WEB");
  const withDue = rowOf(page, "Moving A").getByRole("link", { name: /^Assigned to/ });
  const withoutDue = rowOf(page, "Moving B").getByRole("link", { name: /^Assigned to/ });
  const unassigned = rowOf(page, "Waiting C").getByRole("img", { name: "Unassigned" });
  const centers = [];
  for (const cell of [withDue, withoutDue, unassigned]) {
    await expect(cell).toBeVisible();
    const box = (await cell.boundingBox())!;
    centers.push(Math.round(box.x + box.width / 2));
  }
  expect(centers[1]).toBe(centers[0]);
  expect(centers[2]).toBe(centers[0]);

  // ...and it really is the right edge of the list (a fixed distance from it), not just aligned with itself.
  const surface = (await page.getByRole("region", { name: "Todo issues" }).boundingBox())!;
  const fromEdge = surface.x + surface.width - centers[0]!;
  expect(fromEdge).toBeGreaterThan(10);
  expect(fromEdge).toBeLessThan(45);
});

test("a status tab shows one flat list and sets ?status=; an old status address selects its tab", async ({ loggedInPage: page }) => {
  // Why: the tabs replace the "All statuses" dropdown, so the address must keep meaning the same thing (bookmarks, shared links).
  await setup(page);
  await page.goto("/projects/WEB");
  const tabs = page.getByRole("group", { name: "Status" });
  await tabs.getByRole("button", { name: /^Todo/ }).click();
  await expect(page).toHaveURL(/status=todo/);
  await expect(tabs.getByRole("button", { name: /^Todo/ })).toHaveAttribute("aria-pressed", "true");
  await expect(rowOf(page, "Waiting C")).toBeVisible();
  await expect(rowOf(page, "Moving A")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(0); // flat: no group headers

  await page.goto("/projects/WEB?status=in_progress");
  await expect(tabs.getByRole("button", { name: /^In progress/ })).toHaveAttribute("aria-pressed", "true");
  await expect(rowOf(page, "Moving A")).toBeVisible();
  await expect(rowOf(page, "Moving B")).toBeVisible();
  await expect(rowOf(page, "Waiting C")).toHaveCount(0);

  await page.goto("/projects/WEB?status=done"); // the Done tab loads Done by itself (no group to open)
  await expect(rowOf(page, "Finished D")).toBeVisible();
});

test("a filter narrows every group, shows an active filter in the toolbar, and drops the exact counts", async ({ loggedInPage: page }) => {
  // Why: the project totals no longer describe a filtered list, so the tabs show no number and a group's number is what was loaded.
  const { projectId, issueIds } = await setup(page);
  const { headers, base } = await apiSession(page.request);
  const res = await page.request.patch(`${base}/projects/${projectId}/issues/${issueIds[0]}`, { headers, data: { version: 2, priority: "high" } });
  expect(res.status()).toBe(200);

  await page.goto("/projects/WEB");
  await pick(combobox(page, "Filter by priority"), "High");
  await expect(page).toHaveURL(/priority=high/);
  await expect(combobox(page, "Filter by priority")).toContainText("Priority: High");
  await expect(rowOf(page, "Moving A")).toBeVisible();
  await expect(rowOf(page, "Moving B")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 2, name: /In progress\s*1/ })).toBeVisible();
  await expect(page.getByRole("group", { name: "Status" }).getByRole("button", { name: /^All$/ })).toBeVisible(); // no number

  await pick(combobox(page, "Filter by priority"), "Urgent"); // matches nothing open
  await expect(page.getByText("No open issues match these filters.")).toBeVisible();
  await expect(headerOf(page, /Done/)).toBeVisible(); // finished work stays reachable
});

test("Load more is per group: a long group continues without repeats while the others are untouched", async ({ loggedInPage: page }) => {
  // Why: three queries each with their own cursor. Paging one must not reload, repeat or reset another.
  const titles = Array.from({ length: 27 }, (_, i) => `Todo item ${String(i + 1).padStart(2, "0")}`);
  const { projectId, issueIds } = await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: [...titles, "Busy one"] });
  await patchIssue(page.request, projectId, issueIds[27]!, { status: "in_progress" });
  await page.goto("/projects/WEB");
  await expect(rowOf(page, "Busy one")).toBeVisible();

  const todo = sectionOf(page, "Todo");
  await expect(todo.getByRole("listitem")).toHaveCount(25);
  await expect(sectionOf(page, "In progress").getByRole("button", { name: /Load more/ })).toHaveCount(0);
  await todo.getByRole("button", { name: "Load more todo" }).click();
  await expect(todo.getByRole("listitem")).toHaveCount(27);
  await expect(todo.getByRole("button", { name: /Load more/ })).toHaveCount(0);
  const seen = await todo.getByRole("listitem").allInnerTexts();
  expect(new Set(seen.map((text) => text.split("\n").find((line) => line.startsWith("Todo item")))).size).toBe(27);
  await expect(rowOf(page, "Busy one")).toHaveCount(1);
});

test("changing an issue's status moves its row to the other group", async ({ loggedInPage: page }) => {
  // Why: the groups are separate queries. After an edit they must all refresh, so the row leaves one group and appears in the next.
  await setup(page);
  await page.goto("/projects/WEB");
  const row = rowOf(page, "Waiting C");
  await expect(sectionOf(page, "Todo").getByRole("listitem")).toHaveCount(1);
  await row.hover();
  await row.getByRole("button", { name: "Edit", exact: true }).click();
  await pick(editField(page, "status"), "In progress");
  await page.getByRole("dialog", { name: /^Edit / }).getByRole("button", { name: "Save" }).click();

  await expect(sectionOf(page, "In progress").getByRole("listitem").filter({ hasText: "Waiting C" })).toBeVisible();
  await expect(sectionOf(page, "In progress").getByRole("listitem")).toHaveCount(3);
  await expect(page.getByRole("heading", { level: 2, name: /Todo/ })).toHaveCount(0); // the empty Todo group is left out
  await expect(page.getByRole("heading", { level: 2, name: /In progress\s*3/ })).toBeVisible(); // and the exact count followed
});
