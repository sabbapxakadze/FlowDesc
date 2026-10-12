import { test, expect, logInThroughForm } from "../support/fixtures";
import { createIssueViaApi, createLabelViaApi, createSprintViaApi } from "../support/api";
import { addOrgMember } from "../support/db";

test("a rename in one tab shows up in another person's open tab without reloading or focusing it", async ({
  loggedInPage: pageA,
  browser,
}) => {
  // Why: renames used to reach another open tab only when that tab was focused
  // (window-focus refetch). Both pages here stay open and visible and never get a
  // focus change or a reload, so only the live organization event can update B.
  const { projectId } = await createIssueViaApi(pageA.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["x"],
  });
  await createLabelViaApi(pageA.request, "bug", "#112233");
  await createSprintViaApi(pageA.request, projectId, "Sprint 1");
  await addOrgMember("e2e-user@example.com", {
    email: "e2e-second@example.com",
    name: "Second Person",
  });

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await logInThroughForm(pageB, "e2e-second@example.com");
  const sidebarB = pageB.getByRole("navigation", { name: "Main" });

  // Project rename: B is on the sprints page, watching its own sidebar.
  await pageB.goto(`/projects/${projectId}/sprints`);
  await expect(
    sidebarB.getByRole("link", { name: "Website", exact: true }),
  ).toBeVisible();
  await expect(pageB.getByText("Sprint 1")).toBeVisible();

  await pageA.goto(`/projects/${projectId}/settings`);
  await pageA.getByLabel("Project name").fill("Marketing site");
  await pageA.getByRole("button", { name: "Save" }).click();
  await expect(pageA.getByRole("status")).toHaveText("Saved");
  await expect(
    sidebarB.getByRole("link", { name: "Marketing site", exact: true }),
  ).toBeVisible();

  // Sprint rename: B's sprints page updates.
  await pageA.goto(`/projects/${projectId}/sprints`);
  await pageA.getByRole("button", { name: "Sprint 1 options" }).click();
  await pageA.getByRole("menuitem", { name: "Rename" }).click();
  await pageA.locator(`input[aria-label="Sprint name"]`).fill("Launch sprint");
  await pageA.getByRole("button", { name: "Save" }).click();
  await expect(pageB.getByText("Launch sprint")).toBeVisible();
  await expect(pageB.getByText("Sprint 1")).toHaveCount(0);

  // Label rename: B moves to the Labels page first, then A renames it.
  await pageB.goto("/labels");
  await expect(pageB.getByText("bug", { exact: true })).toBeVisible();
  await pageA.goto("/labels");
  await pageA
    .getByRole("listitem")
    .filter({ hasText: "bug" })
    .getByRole("button", { name: "Edit" })
    .click();
  await pageA.getByLabel("Label name").fill("defect");
  await pageA.getByRole("button", { name: "Save" }).click();
  await expect(pageB.getByText("defect", { exact: true })).toBeVisible();
  await expect(pageB.getByText("bug", { exact: true })).toHaveCount(0);

  await contextB.close();
});

test("a link to something that does not exist says so promptly", async ({
  loggedInPage: page,
}) => {
  // Why: a failed request used to be retried three times with backoff (about 7
  // seconds of skeleton) before "not found". A 4xx answer cannot change by asking
  // again, so it is not retried. The Playwright default expect timeout (5 s) is
  // shorter than the old delay, so this fails without the fix.
  const { projectId } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["x"],
  });
  await page.goto(`/projects/${projectId}/issues/00000000-0000-4000-8000-000000000000`);
  await expect(page.getByText("Issue not found")).toBeVisible();
});
