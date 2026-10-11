import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { createIssueViaApi } from "../support/api";
import { makePng } from "../support/png";

/**
 * Pasting a picture into a comment (ADR 0062). The server rules (drafts, linking, limits) are tested in inline-images.http.test.ts and the Markdown
 * format in the editor and reader unit tests; this is the one trip through a real browser: paste, see it in the box, post, see it in the comment,
 * click it for the zoom popup.
 */

/** Delivers a picture file to the box the way a paste does: a paste event whose clipboard holds the file. */
async function pastePicture(page: Page, name: string) {
  const base64 = makePng(48, 32).toString("base64");
  await page.getByRole("textbox", { name: "Comment", exact: true }).evaluate((box, { base64, name }) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const data = new DataTransfer();
    data.items.add(new File([bytes], name, { type: "image/png" }));
    box.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, { base64, name });
}

test("a pasted picture appears in the box, posts with the comment, shows inside it once, and opens in the zoom popup", async ({ loggedInPage: page }) => {
  // Why: the whole feature end to end: the picture must not be lost between the box, the draft upload and the posted comment, and it must not
  // appear twice (inside the text and again as a thumbnail).
  const { projectId, issueIds } = await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: ["Screenshots"] });
  await page.goto(`/projects/${projectId}/issues/${issueIds[0]}`);
  const box = page.getByRole("textbox", { name: "Comment", exact: true });
  await expect(box).toBeVisible();
  await box.click();
  await page.keyboard.type("It looks like this ");

  await pastePicture(page, "shot.png");
  const inBox = box.locator("img[data-inline-image]");
  await expect(inBox).toHaveCount(1);
  await expect(inBox).toHaveAttribute("data-status", "ready"); // the upload finished and the placeholder became the stored file

  await page.getByRole("button", { name: "Comment", exact: true }).click();

  const card = page.locator("li", { hasText: "It looks like this" }).first();
  await expect(card.locator("img")).toHaveCount(1); // inside the text, and not repeated as a thumbnail under it
  await card.getByRole("link", { name: "Open shot.png" }).click();
  const popup = page.getByRole("dialog", { name: "Preview of shot.png" });
  await expect(popup).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(popup).toBeHidden();
  await expect(box.locator("img")).toHaveCount(0); // the box is empty again

  await page.reload(); // the picture is stored with the comment, not just in the page
  await expect(page.locator("li", { hasText: "It looks like this" }).first().locator("img")).toBeVisible();
});
