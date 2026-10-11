import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { createIssueViaApi } from "../support/api";
import { pastePicture } from "../support/paste";

/**
 * The issue description as a rich editor (ADR 0063). The server rules (which pictures a description may show, mentions, search) are tested in
 * description.http.test.ts, the Markdown in the editor unit tests; this is the trip through a real browser: a picture pasted before the issue exists,
 * drawn in the description, still there after an edit.
 */

const dialogOf = (page: Page, name: string) => page.getByRole("dialog", { name });

test("a picture pasted into the New issue popup is saved with the issue and drawn in its description; the edit popup shows it and keeps it", async ({
  loggedInPage: page,
}) => {
  // Why: the whole feature end to end. The picture is uploaded before the issue exists, so it must be linked when the issue is created, drawn
  // by the issue page, shown again by the edit popup, and not lost when only the words are edited.
  await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["Existing"],
  });
  await page.goto("/projects/WEB");
  await page.getByRole("button", { name: /New issue/ }).click();
  const create = dialogOf(page, "New issue");
  await create.getByLabel("Title").fill("With a screenshot");
  const box = create.getByRole("textbox", { name: "Description" });
  await box.click();
  await page.keyboard.type("It looks like this");
  await pastePicture(box, "shot.png");
  await expect(box.locator("img[data-inline-image]")).toHaveAttribute(
    "data-status",
    "ready",
  );
  await create.getByRole("button", { name: "Add issue" }).click();
  await expect(create).toHaveCount(0);

  await page.goto("/projects/WEB/issues/WEB-2");
  const card = page.getByRole("main"); // the description card is the only place these words appear until the edit popup opens
  await expect(card.getByText("It looks like this")).toBeVisible();
  await expect(card.getByRole("link", { name: "Open shot.png" })).toBeVisible(); // drawn, and it opens the zoom popup

  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const edit = dialogOf(page, "Edit WEB-2");
  const editBox = edit.getByRole("textbox", { name: "Description" });
  await expect(editBox.locator("img[data-inline-image]")).toHaveCount(1); // the edit popup shows what is there
  await editBox.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.type("And more words");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit).toHaveCount(0);

  await expect(card.getByText("And more words")).toBeVisible();
  await expect(card.getByRole("link", { name: "Open shot.png" })).toBeVisible(); // still there after editing only the words
});
