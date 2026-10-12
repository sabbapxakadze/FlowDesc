import { test, expect, logInThroughForm } from "../support/fixtures";
import { createIssueViaApi, createLabelViaApi, createSprintViaApi } from "../support/api";
import { addOrgMember } from "../support/db";

test("an owner renames a project from its settings, the key stays, a member cannot", async ({
  loggedInPage: page,
  browser,
}) => {
  // Why: rename crosses the settings page, the sidebar, page titles and the
  // permission rule (owner/admin only). The key must stay read-only.
  const { projectId } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["An issue"],
  });
  await addOrgMember("e2e-user@example.com", {
    email: "e2e-second@example.com",
    name: "Second Person",
  });

  await page.goto(`/projects/${projectId}`);
  const sidebar = page.getByRole("navigation", { name: "Main" });
  await sidebar.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByText("The key cannot be changed")).toBeVisible();

  await page.getByLabel("Project name").fill("Marketing site");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved");
  await expect(sidebar.getByRole("link", { name: "Marketing site" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Website", exact: true })).toHaveCount(
    0,
  );

  // Persisted, and the key is still WEB on the issue list.
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByText("WEB-1")).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Marketing site" })).toBeVisible();

  // A plain member sees no Settings link, and the page itself is read-only.
  // The absence assertion would pass instantly on a sidebar that has not
  // rendered yet, so first wait until the member list (where the role comes
  // from) has loaded and the project's own links are on screen.
  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await logInThroughForm(pageB, "e2e-second@example.com");
  const membersLoaded = pageB.waitForResponse(
    (res) => res.url().includes("/members") && res.ok(),
  );
  await pageB.goto(`/projects/${projectId}`);
  await membersLoaded;
  const sidebarB = pageB.getByRole("navigation", { name: "Main" });
  await expect(sidebarB.getByRole("link", { name: "Sprints" })).toBeVisible();
  await expect(sidebarB.getByRole("link", { name: "Settings", exact: true })).toHaveCount(0);
  await pageB.goto(`/projects/${projectId}/settings`);
  await expect(
    pageB.getByText("Only owners and admins can change project settings."),
  ).toBeVisible();
  await expect(pageB.getByLabel("Project name")).toHaveCount(0);
  await contextB.close();
});

test("rename and recolour a label, and a duplicate name is refused", async ({
  loggedInPage: page,
}) => {
  // Why: labels are organization-wide, so this goes through the new Labels page.
  // A native colour input is used for the colour; the name must stay unique.
  await createLabelViaApi(page.request, "bug", "#112233");
  await createLabelViaApi(page.request, "feature", "#445566");

  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Labels" })
    .click();
  const row = (name: string) => page.getByRole("listitem").filter({ hasText: name });
  await row("bug").getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Label name").fill("defect");
  await page.getByLabel("Label colour").fill("#ff0000");
  await page.getByRole("button", { name: "Save" }).click();

  const badge = page.getByText("defect", { exact: true });
  await expect(badge).toBeVisible();
  await expect(badge).toHaveCSS("background-color", "rgb(255, 0, 0)");

  await page.reload();
  await expect(page.getByText("defect", { exact: true })).toBeVisible();
  await expect(page.getByText("bug", { exact: true })).toHaveCount(0);

  // Duplicate: renaming "feature" to "defect" must be refused with a message.
  await row("feature").getByRole("button", { name: "Edit" }).click();
  await page.getByLabel("Label name").fill("defect");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("A label with this name already exists")).toBeVisible();
});

test("rename a sprint from the sprints page", async ({ loggedInPage: page }) => {
  // Why: the sprint list is also where Start and Complete live; a rename must
  // not disturb them, and must survive a reload.
  const { projectId } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["x"],
  });
  await createSprintViaApi(page.request, projectId, "Sprint 1");

  await page.goto(`/projects/${projectId}/sprints`);
  await page.getByRole("button", { name: "Sprint 1 options" }).click();
  await page.getByRole("menuitem", { name: "Rename" }).click();
  await page.locator(`input[aria-label="Sprint name"]`).fill("Launch sprint");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Launch sprint")).toBeVisible();
  await expect(page.getByText("Sprint 1")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Start" })).toBeVisible();

  await page.reload();
  await expect(page.getByText("Launch sprint")).toBeVisible();
});
