import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import {
  createIssueViaApi,
  setIssueDueDateViaApi,
  setIssuePriorityViaApi,
} from "../support/api";

/**
 * The Issues list (ADR 0036): one surface of two-line rows under a column header, not a stack of cards. Wide: columns; narrow
 * (a phone, or the issue side panel narrowing the list): the same rows stacked, no header.
 */

const panelOf = (page: Page) => page.getByRole("dialog", { name: "Issue", exact: true });
const row = (page: Page, title: string) =>
  page.getByRole("listitem").filter({ hasText: title });

async function setup(page: Page) {
  const { projectId, issueIds } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["Priority thing", "Late thing", "Mine thing"],
  });
  await setIssuePriorityViaApi(page.request, projectId, issueIds[0]!, "high");
  await setIssueDueDateViaApi(page.request, projectId, issueIds[1]!, "2020-01-02");
  const login = await page.request.post("/api/v1/auth/login", {
    data: { email: "e2e-user@example.com", password: "password123" },
  });
  const { accessToken, user, organization } = await login.json();
  const assigned = await page.request.patch(
    `/api/v1/organizations/${organization.id}/projects/${projectId}/issues/${issueIds[2]}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { version: 1, assigneeId: user.id },
    },
  );
  expect(assigned.status()).toBe(200);
  await page.goto("/projects/WEB");
  await expect(row(page, "Mine thing")).toBeVisible();
}

test("Edit stays out of sight until you point at the row or tab into it, and works from the keyboard", async ({
  loggedInPage: page,
}) => {
  // Why: a column of Edit buttons is noise, but hiding it must never make it unreachable for keyboard users.
  await page.setViewportSize({ width: 1400, height: 900 });
  await setup(page);
  const edit = row(page, "Priority thing").getByRole("button", { name: "Edit" });
  await page.mouse.move(2, 2);
  await expect(edit).toHaveCSS("opacity", "0");
  await row(page, "Priority thing").hover();
  await expect(edit).toHaveCSS("opacity", "1");
  await page.mouse.move(2, 2);
  await expect(edit).toHaveCSS("opacity", "0");
  await edit.focus(); // tabbing in: focus alone reveals it
  await expect(edit).toHaveCSS("opacity", "1");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog", { name: "Edit WEB-1" })).toBeVisible();
});

test("narrow (a phone): the key sits under the title, the assignee stays on the title's line at the right, and the page does not scroll sideways", async ({
  loggedInPage: page,
}) => {
  // Why: one line per issue needs room. On a phone the same row stacks (title and assignee first, the key and due date under the title)
  // instead of squeezing six columns into 400 pixels.
  await page.setViewportSize({ width: 420, height: 800 });
  await setup(page);
  const priorityRow = row(page, "Priority thing");
  const title = (await priorityRow.getByText("Priority thing").boundingBox())!;
  const key = (await priorityRow.getByText(/^WEB-\d+$/).boundingBox())!;
  expect(key.y).toBeGreaterThan(title.y + title.height - 1); // under the title, not beside it
  const assignee = (await row(page, "Mine thing").getByRole("link", { name: /^Assigned to/ }).boundingBox())!;
  const mineTitle = (await row(page, "Mine thing").getByText("Mine thing").boundingBox())!;
  expect(assignee.y).toBeLessThan(mineTitle.y + mineTitle.height); // on the title's line
  expect(assignee.x + assignee.width).toBeGreaterThan(380); // at the right edge
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
});

test("clicking an empty part of a row opens the issue in the side panel; Edit still opens the editor, not the panel", async ({
  loggedInPage: page,
}) => {
  // Why: only the title text was a link, so a click between the columns did nothing. The whole row should open the issue, without
  // taking the clicks of the controls inside it (Edit, the assignee, the label pills).
  await page.setViewportSize({ width: 1400, height: 900 });
  await setup(page);

  const late = row(page, "Late thing");
  const box = (await late.boundingBox())!;
  await late.click({ position: { x: box.width * 0.5, y: box.height / 2 } }); // the gap between the title and the status column
  await expect(page).toHaveURL(/issue=WEB-2/);
  await expect(panelOf(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(panelOf(page)).toHaveCount(0);

  await row(page, "Priority thing").hover();
  await row(page, "Priority thing").getByRole("button", { name: "Edit" }).click();
  await expect(page.getByRole("dialog", { name: "Edit WEB-1" })).toBeVisible();
  await expect(page).not.toHaveURL(/issue=/); // Edit was not mistaken for a click on the row
});
