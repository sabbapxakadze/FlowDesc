import { test, expect } from "../support/fixtures";
import { apiSession, createIssueViaApi } from "../support/api";

/**
 * The full issue page (ADR 0061, the owner's pick B of three layouts): the title with Edit at its right, a properties card (status, priority, assignee, due date,
 * labels, reporter, created, updated), the description in its own card, then attachments and activity. The side panel keeps its compact layout.
 */

test("the page shows a properties card with the issue's values, and the description in its own card", async ({ loggedInPage: page }) => {
  // Why: the point of the redesign: every property has a labelled place instead of a loose row of chips.
  const { projectId, issueIds } = await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: ["Fix the hero image"] });
  const { headers, base } = await apiSession(page.request);
  const members = await (await page.request.get(`${base}/members`, { headers })).json();
  const me = members.data[0].userId as string;
  const patch = await page.request.patch(`${base}/projects/${projectId}/issues/${issueIds[0]}`, {
    headers,
    data: { version: 1, description: "It shifts the heading down.", priority: "high", assigneeId: me, dueDate: "2030-01-15" },
  });
  expect(patch.status()).toBe(200);

  await page.goto("/projects/WEB/issues/WEB-1");
  await expect(page.getByRole("heading", { level: 1, name: "Fix the hero image" })).toBeVisible();
  const properties = page.getByRole("main").locator("dl");
  for (const label of ["Status", "Priority", "Assignee", "Due", "Labels", "Reporter", "Created", "Updated"]) {
    await expect(properties.getByText(label, { exact: true })).toBeVisible();
  }
  await expect(properties).toContainText("High");
  await expect(properties).toContainText("E2E User"); // assignee and reporter
  await expect(properties).toContainText("Jan 15, 2030");
  await expect(properties).toContainText("No labels"); // none yet (spoken; the eye sees a dash)
  await expect(page.getByRole("heading", { level: 2, name: "Description" })).toBeVisible();
  await expect(page.getByText("It shifts the heading down.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
});

test("an issue with nothing set shows a dash in each empty cell, and says what is empty in words for a screen reader", async ({ loggedInPage: page }) => {
  // Why: empty values must read as empty, not as a missing piece of the page.
  await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: ["Bare issue"] });
  await page.goto("/projects/WEB/issues/WEB-1");
  const properties = page.getByRole("main").locator("dl");
  await expect(properties).toContainText("No priority");
  await expect(properties).toContainText("Unassigned");
  await expect(properties).toContainText("No due date");
  await expect(properties).toContainText("No labels");
  await expect(properties.getByText("–", { exact: true })).toHaveCount(4); // priority, assignee, due, labels: a dash each
  await expect(page.getByText("No description.")).toBeVisible();
});

test("the side panel keeps its compact layout: no properties card", async ({ loggedInPage: page }) => {
  // Why: the redesign is for the full page only; the panel is narrow and keeps its meta row.
  await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: ["Panel issue"] });
  await page.goto("/projects/WEB?issue=WEB-1");
  const panel = page.getByRole("dialog", { name: "Issue", exact: true });
  await expect(panel).toContainText("Panel issue");
  await expect(panel.getByText("Reporter", { exact: true })).toHaveCount(0);
  await expect(panel.locator("dl")).toHaveCount(0);
});

test("a very long description is folded with Show more and Show less; a short one has no button", async ({ loggedInPage: page }) => {
  // Why: a description of dozens of lines pushed the attachments and the whole activity out of sight. It is folded (about 15rem) and opens on request.
  const { projectId, issueIds } = await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: ["Long one", "Short one"] });
  const { headers, base } = await apiSession(page.request);
  const long = Array.from({ length: 80 }, (_, index) => `Line number ${index + 1} of a very long description`).join("\n");
  expect((await page.request.patch(`${base}/projects/${projectId}/issues/${issueIds[0]}`, { headers, data: { version: 1, description: long } })).status()).toBe(200);
  expect((await page.request.patch(`${base}/projects/${projectId}/issues/${issueIds[1]}`, { headers, data: { version: 1, description: "Just one line." } })).status()).toBe(200);

  await page.goto("/projects/WEB/issues/WEB-1");
  const more = page.getByRole("button", { name: "Show more" });
  await expect(more).toBeVisible();
  // The folded box is the one the button controls (the description is drawn by the comment reader now, so its depth is not something to count).
  const box = page.locator(`[id="${await more.getAttribute("aria-controls")}"]`);
  const folded = await box.evaluate((node) => node.clientHeight);
  expect(folded).toBeLessThanOrEqual(241);
  await more.click();
  await expect(page.getByRole("button", { name: "Show less" })).toBeVisible();
  const open = await box.evaluate((node) => node.clientHeight);
  expect(open).toBeGreaterThan(folded * 3);
  await page.getByRole("button", { name: "Show less" }).click();
  await expect(more).toBeVisible();

  await page.goto("/projects/WEB/issues/WEB-2");
  await expect(page.getByText("Just one line.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Show more" })).toHaveCount(0);
});
