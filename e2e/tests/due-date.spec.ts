import { test, expect } from "../support/fixtures";
import { createIssueViaApi, setIssueDueDateViaApi, setTimezoneViaApi } from "../support/api";
import { combobox, editor, pick } from "../support/dropdown";

/**
 * Due dates (ADR 0032): a calendar day set in the edit popup, shown as a chip, "Overdue" when the day is before today
 * (in the person's timezone) on unfinished work, filterable, and written into the activity.
 */

const PAST = "2020-01-02";
const FUTURE = "2099-01-02";

test("set a past date in the editor: Overdue on the list, in the filter and in the activity; done and cleared remove it", async ({
  loggedInPage: page,
}) => {
  // Why: the whole slice end to end. The edit form resends every field on a save, so the last steps also guard that an
  // unchanged date writes no second activity line.
  const { projectId, issueIds } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["Late thing", "Future thing", "Undated thing"],
  });
  await setIssueDueDateViaApi(page.request, projectId, issueIds[1]!, FUTURE);
  await page.goto(`/projects/${projectId}`);
  const card = (title: string) => page.getByRole("listitem").filter({ hasText: title });

  await card("Late thing").getByRole("button", { name: "Edit" }).click();
  await editor(page).getByLabel("Due date").fill(PAST);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(card("Late thing")).toContainText("Overdue");
  await expect(card("Late thing")).toContainText("Jan 2, 2020"); // another year than now: the year is shown
  await expect(card("Future thing")).toContainText("Jan 2, 2099");
  await expect(card("Future thing")).not.toContainText("Overdue"); // a future day is not overdue
  await expect(card("Undated thing")).not.toContainText("Overdue");

  // The filter: Overdue shows only the late one, No due date only the undated one; the choice lives in the URL.
  await pick(combobox(page, "Filter by due date"), "Overdue");
  await expect(page).toHaveURL(/due=overdue/);
  await expect(card("Late thing")).toBeVisible();
  await expect(card("Future thing")).toHaveCount(0);
  await expect(card("Undated thing")).toHaveCount(0);
  await pick(combobox(page, "Filter by due date"), "No due date");
  await expect(card("Undated thing")).toBeVisible();
  await expect(card("Late thing")).toHaveCount(0);
  await pick(combobox(page, "Filter by due date"), "Any due date");

  // Saving again without touching the date writes no second "due date" line.
  await card("Late thing").getByRole("button", { name: "Edit" }).click();
  await editor(page).getByLabel("Description").click(); // a rich editor now, not a textarea
  await page.keyboard.type("Now with a description");
  await page.getByRole("button", { name: "Save" }).click();
  await page.goto(`/projects/${projectId}/issues/${issueIds[0]}`);
  await expect(page.getByText("set the due date to")).toHaveCount(1);
  await expect(page.getByText("Overdue").first()).toBeVisible(); // also on the issue page

  // Finished work is never overdue.
  await page.getByRole("button", { name: "Edit" }).click();
  await pick(editor(page).getByRole("combobox", { name: /status/i }), "Done");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Overdue")).toHaveCount(0);
  await expect(page.getByTitle("Due 2020-01-02")).toBeVisible(); // the date stays, only the marker goes

  // Removing the date.
  await page.getByRole("button", { name: "Edit" }).click();
  await editor(page).getByLabel("Due date").fill("");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("removed the due date")).toBeVisible();
  await expect(page.getByTitle(/^Due 2020-01-02/)).toHaveCount(0); // the chip is gone (the older activity line stays)
});

test("'today' is the person's own calendar day: the same date is overdue in a zone ahead and not in a zone behind", async ({
  loggedInPage: page,
}) => {
  // Why: this is where off-by-one-day bugs live. Pacific/Pago_Pago (UTC-11) and Pacific/Kiritimati (UTC+14) are 25 hours
  // apart, so a date that is "today" in the first has already passed in the second.
  const { projectId, issueIds } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["Boundary thing"],
  });
  const behind = new Intl.DateTimeFormat("en-CA", { timeZone: "Pacific/Pago_Pago" }).format(new Date());
  await setIssueDueDateViaApi(page.request, projectId, issueIds[0]!, behind);

  await setTimezoneViaApi(page.request, "Pacific/Pago_Pago");
  await page.goto(`/projects/${projectId}`);
  const row = page.getByRole("listitem").filter({ hasText: "Boundary thing" });
  await expect(row).toBeVisible();
  await expect(row).not.toContainText("Overdue"); // due today there

  await setTimezoneViaApi(page.request, "Pacific/Kiritimati");
  await page.reload();
  await expect(row).toContainText("Overdue"); // already yesterday there
  await pick(combobox(page, "Filter by due date"), "Overdue");
  await expect(row).toBeVisible(); // the list agrees with the marker, not with the server's UTC day
  await setTimezoneViaApi(page.request, null);
});
