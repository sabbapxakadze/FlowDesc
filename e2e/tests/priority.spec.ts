import { test, expect } from "../support/fixtures";
import { createIssueViaApi } from "../support/api";
import { combobox, editField, editor, pick } from "../support/dropdown";

test("set a priority, see it on the card, filter by it, and see it in the activity once", async ({
  loggedInPage: page,
}) => {
  // Why: priority touches the edit form, the list, the URL filter and the
  // activity timeline. The last assertion guards a specific trap: the edit form
  // resends every field on each save, so a priority that did not change must
  // not write a second "changed priority" line.
  const { projectId, issueIds } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["Urgent thing", "Calm thing"],
  });
  await page.goto(`/projects/${projectId}`);

  // Set High on the first issue through the edit form.
  const card = (title: string) => page.getByRole("listitem").filter({ hasText: title });
  await card("Urgent thing").getByRole("button", { name: "Edit" }).click();
  await pick(editField(page, "Priority"), "High");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(card("Urgent thing").getByRole("img", { name: "High priority" })).toBeVisible(); // the priority is an icon with a name
  await expect(card("Calm thing").getByRole("img", { name: "High priority" })).toHaveCount(0);

  // Filter: only the high-priority issue remains, and the choice lives in the URL.
  await pick(combobox(page, "Filter by priority"), "High");
  await expect(page).toHaveURL(/priority=high/);
  await expect(card("Urgent thing")).toBeVisible();
  await expect(card("Calm thing")).toHaveCount(0);
  await page.reload();
  await expect(card("Urgent thing")).toBeVisible();
  await expect(card("Calm thing")).toHaveCount(0);

  // Edit again without touching priority: the activity must still show only one priority change.
  await card("Urgent thing").getByRole("button", { name: "Edit" }).click();
  const editForm = editor(page).locator("form");
  await editForm.getByLabel("Description").click(); // a rich editor now, not a textarea
  await page.keyboard.type("Now with a description");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Now with a description")).toHaveCount(0); // list cards do not show it

  await page.goto(`/projects/${projectId}/issues/${issueIds[0]}`);
  await expect(page.getByText("changed priority to High")).toHaveCount(1);
  // The second save only changed the description. The form resends title and
  // status too, but the server must log only what really changed.
  await expect(page.getByText("updated the description")).toHaveCount(1);
  await expect(page.getByText(/changed the title/)).toHaveCount(0);
  await expect(page.getByText(/changed status/)).toHaveCount(0);
});
