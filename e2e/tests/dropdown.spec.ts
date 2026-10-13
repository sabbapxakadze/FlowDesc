import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { createIssueViaApi, createLabelViaApi } from "../support/api";
import { addOrgMember } from "../support/db";
import { combobox, editField, editor, expectValue } from "../support/dropdown";

/**
 * The app's own dropdown (shared/ui/Dropdown) replaced every native <select>: filters, sort, the issue editor, roles,
 * labels, the audit log and the analytics ranges.
 */

const listbox = (page: Page) => page.getByRole("listbox");

async function setup(page: Page, titles = ["Alpha", "Beta"]) {
  return createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles });
}

test("it opens with the mouse or keys, moves with the arrows, chooses with Enter, and says what it holds", async ({
  loggedInPage: page,
}) => {
  // Why: the basics, and the accessible shape (combobox, listbox, option, aria-selected) a screen reader relies on.
  await setup(page);
  await page.goto("/projects/WEB");
  const due = combobox(page, "Filter by due date");
  await expect(due).toHaveAttribute("aria-expanded", "false");
  await expectValue(due, "");

  await due.focus();
  await page.keyboard.press("ArrowDown"); // opens
  await expect(due).toHaveAttribute("aria-expanded", "true");
  await expect(listbox(page)).toBeVisible();
  await expect(page.getByRole("option", { name: "Any due date" })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("ArrowDown"); // Overdue
  await page.keyboard.press("ArrowDown"); // No due date
  await page.keyboard.press("Enter");
  await expect(listbox(page)).toHaveCount(0);
  await expect(page).toHaveURL(/due=none/);
  await expectValue(due, "none");
  await expect(due).toBeFocused(); // focus stays on the box

  // Type-ahead: "o" jumps to Overdue.
  await page.keyboard.press("ArrowDown");
  await page.keyboard.type("o");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/due=overdue/);
});

test("Esc closes only the list: the side panel and a dialog behind it stay open", async ({ loggedInPage: page }) => {
  // Why: Esc used to close the panel or dialog; with a list open it must close just the list first.
  await setup(page);
  await page.goto("/projects/WEB?issue=WEB-1");
  const panel = page.locator('section[aria-label="Issue"]');
  await expect(panel).toBeVisible();

  // Opened from the keyboard: the panel now overlays the right-hand end of the toolbar (ADR 0073), so at some window widths the Sort box sits
  // under the panel and a mouse click would land on the panel. The list itself still floats above it.
  const sort = combobox(page, "Sort");
  await sort.focus();
  await page.keyboard.press("ArrowDown");
  await expect(listbox(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(listbox(page)).toHaveCount(0);
  await expect(panel).toBeVisible();

  await panel.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(editor(page)).toBeVisible();
  await editField(page, "Priority").click();
  await expect(listbox(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(listbox(page)).toHaveCount(0);
  await expect(editor(page)).toBeVisible(); // the popup is still there
  await page.keyboard.press("Escape");
  await expect(editor(page)).toHaveCount(0); // and the next Esc closes it
});

test("inside the issue editor it is not clipped, the label does not reopen it, and it flips upward near the bottom", async ({
  loggedInPage: page,
}) => {
  // Why: the editor is a dialog (overflow, top layer) inside <label>s; a list that is clipped, or that a label click
  // reopens, would be broken there. A short window forces the list to open upward: the Dropdown opens up when fewer than 200px are
  // left below its box, and the editor got shorter when the due date field joined it, so 560px no longer leaves less than that.
  const HEIGHT = 520;
  await setup(page);
  await page.setViewportSize({ width: 1100, height: HEIGHT });
  await page.goto("/projects/WEB");
  await page.getByRole("listitem").filter({ hasText: "Alpha" }).getByRole("button", { name: "Edit" }).click();

  const status = editField(page, "Status");
  await status.click();
  await expect(listbox(page)).toBeVisible();
  const box = (await page.locator("div.motion-drop-in").boundingBox())!;
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(HEIGHT);
  await page.getByRole("option", { name: "Done", exact: true }).click();
  await expect(listbox(page)).toHaveCount(0); // chosen, and the <label> around the box did not open it again
  await expectValue(status, "done");

  const priority = editField(page, "Priority");
  const trigger = (await priority.boundingBox())!;
  await priority.click();
  const list = (await page.locator("div.motion-drop-in").boundingBox())!;
  expect(list.y + list.height).toBeLessThanOrEqual(HEIGHT);
  expect(list.y + list.height).toBeLessThanOrEqual(trigger.y + 1); // opened upward: there was more room above
  await page.keyboard.press("Escape");
});

test("a long list gets a search box that filters it, and says when nothing matches", async ({ loggedInPage: page }) => {
  // Why: people lists can be long (the assignee dropdown), so past seven options a search box appears.
  await setup(page);
  for (let i = 1; i <= 8; i++) {
    await addOrgMember("e2e-user@example.com", { email: `member${i}@example.com`, name: `Person Number${i}` });
  }
  await page.goto("/projects/WEB");
  const assignee = combobox(page, "Filter by assignee");
  await assignee.click();
  const search = page.getByRole("searchbox", { name: "Search options" });
  await expect(search).toBeFocused();
  await search.fill("Number3");
  await expect(page.getByRole("option")).toHaveCount(1);
  await search.fill("zzz");
  await expect(page.getByText("No matches")).toBeVisible();
  await search.fill("Number5");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/assignee=/);
  await expect(assignee).toContainText("Person Number5");

  // A short list (due date) has none.
  await combobox(page, "Filter by due date").click();
  await expect(page.getByRole("searchbox")).toHaveCount(0);
});

test("a click elsewhere closes it", async ({ loggedInPage: page }) => {
  // Why: the list is fixed to the screen, so it must not be left behind.
  await setup(page);
  await page.goto("/projects/WEB");
  await combobox(page, "Sort").click();
  await expect(listbox(page)).toBeVisible();
  await page.getByRole("heading", { level: 1, name: "Issues" }).click();
  await expect(listbox(page)).toHaveCount(0);
});

test("every dropdown in the issue editor has an accessible name", async ({ loggedInPage: page }) => {
  // Why: a screen reader announces "combobox" and nothing else for a box with no name. The label picker's box had
  // none (found by reading the accessibility tree).
  await setup(page);
  await page.goto("/projects/WEB");
  await page.getByRole("listitem").filter({ hasText: "Alpha" }).getByRole("button", { name: "Edit" }).click();
  for (const name of ["Status", "Priority", "Assignee", "Add label"]) {
    await expect(editor(page).getByRole("combobox", { name: new RegExp(name, "i") })).toBeVisible();
  }
  await expect(editor(page).getByRole("combobox")).toHaveCount(4);
});

test("the label picker stays open so several labels can be added in one go", async ({ loggedInPage: page }) => {
  // Why: it used to close after each label, so three labels meant opening it three times. Each chosen label leaves the list;
  // Esc closes it.
  await setup(page);
  for (const [name, color] of [["bug", "#cc0000"], ["design", "#0066cc"], ["docs", "#008800"]] as const) {
    await createLabelViaApi(page.request, name, color);
  }
  await page.goto("/projects/WEB");
  await page.getByRole("listitem").filter({ hasText: "Alpha" }).getByRole("button", { name: "Edit" }).click();
  const picker = combobox(editor(page), "Add label");
  await picker.click();
  await expect(page.getByRole("option")).toHaveCount(3);

  await page.getByRole("option", { name: "bug", exact: true }).click();
  await expect(page.getByRole("option")).toHaveCount(2); // bug left the list...
  await expect(page.getByRole("listbox")).toBeVisible(); // ...and the list is still open
  await page.getByRole("option", { name: "design", exact: true }).click();
  await expect(page.getByRole("option")).toHaveCount(1);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(editor(page)).toBeVisible(); // Esc closed only the list
  await expect(editor(page).getByText("bug", { exact: true })).toBeVisible(); // both are on the issue
  await expect(editor(page).getByText("design", { exact: true })).toBeVisible();
});
