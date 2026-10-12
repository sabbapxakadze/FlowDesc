import { test, expect, logInThroughForm } from "../support/fixtures";
import { createIssueViaApi, createLabelViaApi, createSprintViaApi } from "../support/api";
import { addOrgMember } from "../support/db";

test("deleting an issue asks first, removes it, and sends another viewer away live", async ({
  loggedInPage: pageA,
  browser,
}) => {
  // Why: hard delete is irreversible, so the confirmation must really gate it;
  // and a second person looking at the issue must be sent back to the list
  // (not left on a 404) without reloading. A plain member who did not report
  // the issue must not be offered the button at all.
  const { projectId, issueIds } = await createIssueViaApi(pageA.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["Doomed issue", "Survivor"],
  });
  await addOrgMember("e2e-user@example.com", {
    email: "e2e-second@example.com",
    name: "Second Person",
  });

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await logInThroughForm(pageB, "e2e-second@example.com");
  const issueUrl = `/projects/${projectId}/issues/${issueIds[0]}`;
  const membersLoaded = pageB.waitForResponse(
    (res) => res.url().includes("/members") && res.ok(),
  );
  await pageB.goto(issueUrl);
  await membersLoaded;
  await expect(pageB.getByRole("heading", { name: "Doomed issue" })).toBeVisible();
  await expect(pageB.getByRole("button", { name: "Delete issue" })).toHaveCount(0);

  // A (the reporter) is asked first; Cancel backs out and nothing is deleted.
  await pageA.goto(issueUrl);
  await pageA.getByRole("button", { name: "Delete issue" }).click();
  await expect(pageA.getByText("permanently removed")).toBeVisible();
  await pageA.getByRole("button", { name: "Cancel" }).click();
  await expect(pageA.getByText("permanently removed")).toHaveCount(0);
  await expect(pageA.getByRole("heading", { name: "Doomed issue" })).toBeVisible();

  // Then really delete.
  await pageA.getByRole("button", { name: "Delete issue" }).click();
  await pageA
    .getByRole("alertdialog")
    .getByRole("button", { name: "Delete issue" })
    .click();
  await expect(pageA).toHaveURL(/\/projects\/WEB$/);
  await expect(
    pageA.getByRole("listitem").filter({ hasText: "Doomed issue" }),
  ).toHaveCount(0);
  await expect(pageA.getByRole("listitem").filter({ hasText: "Survivor" })).toBeVisible();

  // B, who was looking at it, is sent to the project's list without a reload.
  await expect(pageB).toHaveURL(/\/projects\/WEB$/);
  // ...with a notice saying why, which can be dismissed.
  await expect(pageB.getByRole("status")).toContainText("This issue was deleted.");
  await pageB.getByRole("button", { name: "Dismiss" }).click();
  await expect(pageB.getByRole("status")).toHaveCount(0);
  await expect(pageB).toHaveURL(/\/projects\/WEB$/);

  // A deleted issue's URL no longer works, and says so promptly: a 404 is not
  // retried, so there is no seven-second skeleton first (default timeout).
  await pageB.goto(issueUrl);
  await expect(pageB.getByText("Issue not found")).toBeVisible();
  await contextB.close();
});

test("an owner deletes a label after confirming; a plain member is not offered it", async ({
  loggedInPage: page,
  browser,
}) => {
  // Why: deleting a label changes every issue that uses it, so it is admin-level.
  await createLabelViaApi(page.request, "bug", "#112233");
  await createLabelViaApi(page.request, "feature", "#445566");
  await addOrgMember("e2e-user@example.com", {
    email: "e2e-second@example.com",
    name: "Second Person",
  });

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await logInThroughForm(pageB, "e2e-second@example.com");
  const membersLoaded = pageB.waitForResponse(
    (res) => res.url().includes("/members") && res.ok(),
  );
  await pageB.goto("/labels");
  await membersLoaded;
  await expect(pageB.getByRole("button", { name: "Edit" })).toHaveCount(2);
  await expect(pageB.getByRole("button", { name: "Delete" })).toHaveCount(0);
  await contextB.close();

  await page.goto("/labels");
  const row = (name: string) => page.getByRole("listitem").filter({ hasText: name });
  await row("bug").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText(`Delete the label "bug"?`)).toBeVisible();
  await page.getByRole("button", { name: "Delete label" }).click();
  await expect(row("bug")).toHaveCount(0);
  await expect(row("feature")).toBeVisible();

  await page.reload();
  await expect(row("bug")).toHaveCount(0);
});

test("a sprint can be deleted, but not while it is active", async ({
  loggedInPage: page,
}) => {
  // Why: deleting the sprint people are working in would drop the active-sprint
  // view under them, so the control is not offered for an active sprint.
  const { projectId } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["x"],
  });
  await createSprintViaApi(page.request, projectId, "Old sprint");
  await createSprintViaApi(page.request, projectId, "Live sprint");

  await page.goto(`/projects/${projectId}/sprints`);
  const row = (name: string) => page.getByRole("list", { name: "Sprints" }).getByRole("listitem").filter({ hasText: name });

  // Start "Live sprint": its Delete disappears and Complete appears in the active lane.
  await row("Live sprint").getByRole("button", { name: "Start sprint" }).click();
  await expect(page.getByRole("button", { name: "Complete sprint" })).toBeVisible();
  await row("Live sprint").getByRole("button", { name: "Live sprint options" }).click();
  await expect(page.getByRole("menuitem", { name: "Delete" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  // "Old sprint" is deletable, after a confirmation.
  await row("Old sprint").getByRole("button", { name: "Old sprint options" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByText(`Delete the sprint "Old sprint"?`)).toBeVisible();
  await page.getByRole("button", { name: "Delete sprint" }).click();
  await expect(row("Old sprint")).toHaveCount(0);
  await expect(row("Live sprint")).toBeVisible();

  await page.reload();
  await expect(row("Old sprint")).toHaveCount(0);
});

test("deleting a project needs its typed name, removes it everywhere, and sends another viewer away live", async ({
  loggedInPage: page,
  browser,
}) => {
  // Why: the most destructive action in the app. The button must stay disabled
  // until the exact name is typed; the project must vanish from the sidebar and
  // the projects list; and a second person who has one of its pages open must be
  // sent to the projects list instead of being left on pages that now fail. A
  // plain member must not be offered the control at all.
  const { projectId } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["An issue", "Another issue"],
  });
  await createIssueViaApi(page.request, {
    projectName: "Keep me",
    projectKey: "KEP",
    titles: ["Neighbour"],
  });
  await addOrgMember("e2e-user@example.com", {
    email: "e2e-second@example.com",
    name: "Second Person",
  });

  const contextB = await browser.newContext();
  const pageB = await contextB.newPage();
  await logInThroughForm(pageB, "e2e-second@example.com");
  const membersLoaded = pageB.waitForResponse(
    (res) => res.url().includes("/members") && res.ok(),
  );
  await pageB.goto(`/projects/${projectId}/settings`);
  await membersLoaded;
  await expect(
    pageB.getByText("Only owners and admins can change project settings."),
  ).toBeVisible();
  await expect(pageB.getByRole("button", { name: "Delete project" })).toHaveCount(0);
  await pageB.goto(`/projects/${projectId}`);
  await expect(pageB.getByRole("listitem").filter({ hasText: "An issue" })).toBeVisible();

  // A: ask, get the warning, and be blocked until the exact name is typed.
  await page.goto(`/projects/${projectId}/settings`);
  await page.getByRole("button", { name: "Delete project" }).click();
  await expect(page.getByText("permanently deletes")).toBeVisible();
  const confirm = page.getByRole("button", { name: "Delete this project" });
  await expect(confirm).toBeDisabled();
  await page.getByLabel("Confirm project name").fill("website");
  await expect(confirm).toBeDisabled();
  await page.getByLabel("Confirm project name").fill("Website");
  await expect(confirm).toBeEnabled();

  // Cancel backs out and resets the typed text.
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Delete project" }).click();
  await expect(page.getByLabel("Confirm project name")).toHaveValue("");
  await page.getByLabel("Confirm project name").fill("Website");
  await page.getByRole("button", { name: "Delete this project" }).click();

  // Gone for A: redirected, absent from the sidebar and the list, still gone after a reload.
  await expect(page).toHaveURL(/\/projects$/);
  const sidebar = page.getByRole("navigation", { name: "Main" });
  await expect(sidebar.getByRole("link", { name: "Keep me" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Website", exact: true })).toHaveCount(
    0,
  );
  await page.reload();
  await expect(
    page.getByRole("main").getByRole("link", { name: /Keep me/ }),
  ).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: /Website/ })).toHaveCount(
    0,
  );

  // B, who had one of its pages open, was sent to the projects list live, and the neighbour is intact.
  await expect(pageB).toHaveURL(/\/projects$/);
  await expect(pageB.getByRole("status")).toContainText("This project was deleted.");
  await expect(
    pageB
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Website", exact: true }),
  ).toHaveCount(0);
  await expect(
    pageB
      .getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Keep me" }),
  ).toBeVisible();
  await contextB.close();
});
