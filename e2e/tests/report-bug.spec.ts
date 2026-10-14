import type { Locator, Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { makePng } from "../support/png";
import { pastePicture } from "../support/paste";

/**
 * "Report a bug" (ADR 0075): the bug icon in the sidebar, the form, and what the person is told. The server's rules (who may send, what a file
 * must be, the email itself) are tested over HTTP in apps/api; the browser tests run the API with EMAIL_DRIVER=log, so nothing here proves a
 * real email arrives. These tests are about the screen, and about the icon really fitting where it was put.
 */

const bugButton = (page: Page) => page.getByRole("button", { name: "Report a bug" });
const dialog = (page: Page) => page.getByRole("dialog", { name: "Report a bug" });

const box = async (locator: Locator) => {
  const b = await locator.boundingBox();
  if (!b) throw new Error("not visible");
  return b;
};

/** The three small controls in the sidebar's bottom row must sit on one line, side by side, inside the sidebar, whatever the width. */
async function expectRowFits(page: Page, sidebar: Locator) {
  const theme = await box(sidebar.locator('[data-tour="theme-switch"]'));
  const mcp = await box(sidebar.locator('[data-tour="mcp-status"]'));
  const bug = await box(bugButton(page));
  const side = await box(sidebar);
  const [first, second, third] = [theme, mcp, bug];
  // Left to right, without touching (a visible gap), inside the sidebar...
  expect(first.x + first.width).toBeLessThan(second.x - 4);
  expect(second.x + second.width).toBeLessThan(third.x - 2);
  expect(third.x + third.width).toBeLessThanOrEqual(side.x + side.width - 4);
  // ...and on one line: their vertical centres agree to within a few pixels.
  const centre = (b: { y: number; height: number }) => b.y + b.height / 2;
  expect(Math.abs(centre(first) - centre(second))).toBeLessThan(6);
  expect(Math.abs(centre(second) - centre(third))).toBeLessThan(6);
}

test("the bug icon sits on one row with the theme switch and the MCP pill, on a desktop and in the phone drawer", async ({ loggedInPage: page }) => {
  // Why: this is where the icon was put on the condition that it fits (ADR 0075). If a later change to the sidebar squeezes the row, the icon would
  // wrap or run past the edge, and this says so instead of a person finding out.
  const sidebar = page.getByRole("navigation", { name: "Main" }).locator("xpath=..");
  await expect(bugButton(page)).toBeVisible();
  await expectRowFits(page, sidebar);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open menu" }).click();
  const drawer = page.getByRole("dialog", { name: "Navigation" });
  await expect(bugButton(page)).toBeVisible();
  await expectRowFits(page, drawer.getByRole("navigation", { name: "Main" }).locator("xpath=.."));
});

test("a report needs words, shows the pictures chosen, and says thank you once it is sent", async ({ loggedInPage: page }) => {
  // Why: the whole flow. The Send button must not work on an empty form, a picture must be visible and removable before it is sent, and the
  // request must carry exactly what the person typed, the page they were on and their pictures.
  await page.goto("/projects");
  await bugButton(page).click();
  await expect(dialog(page)).toBeVisible();
  const send = dialog(page).getByRole("button", { name: "Send report" });
  await expect(send).toBeDisabled();

  await dialog(page).getByLabel("What went wrong?").fill("The board went blank after a drag");
  await expect(send).toBeEnabled();

  await dialog(page).getByLabel("Choose screenshots").setInputFiles([
    { name: "first.png", mimeType: "image/png", buffer: makePng(40, 30) },
    { name: "second.png", mimeType: "image/png", buffer: makePng(40, 30, [200, 40, 40]) },
  ]);
  const pictures = dialog(page).getByRole("list", { name: "Screenshots to send" }).getByRole("listitem");
  await expect(pictures).toHaveCount(2);
  await dialog(page).getByRole("button", { name: "Remove screenshot 1" }).click();
  await expect(pictures).toHaveCount(1);

  // Playwright cannot read a multipart body that holds files, so the form data is read inside the page just before it goes out.
  await page.evaluate(() => {
    const w = window as unknown as { __report?: { fields: Record<string, string>; pictures: string[] } };
    const original = window.fetch;
    window.fetch = (input, init) => {
      if (String(input).includes("/bug-reports") && init?.body instanceof FormData) {
        const fields: Record<string, string> = {};
        const pictures: string[] = [];
        for (const [name, value] of init.body.entries()) {
          if (value instanceof File) pictures.push(value.name);
          else fields[name] = value;
        }
        w.__report = { fields, pictures };
      }
      return original(input, init);
    };
  });
  await send.click();
  await expect(dialog(page).getByRole("status")).toContainText("Thank you, your report was sent");
  const report = await page.evaluate(() => (window as unknown as { __report?: { fields: Record<string, string>; pictures: string[] } }).__report);
  expect(report?.fields.description).toBe("The board went blank after a drag");
  expect(report?.fields.page).toBe("/projects"); // the page the person was on
  expect(report?.fields.viewport).toMatch(/^\d+x\d+$/);
  expect(report?.pictures).toEqual(["second.png"]); // the removed picture was not sent

  // The dialog's own X is also called Close, so the button is picked inside the thank-you message.
  await dialog(page).getByRole("status").getByRole("button", { name: "Close" }).click();
  await expect(dialog(page)).toHaveCount(0);
});

test("a copied screenshot can be pasted in, and a file that is not a picture, or a fourth picture, is refused with a reason", async ({ loggedInPage: page }) => {
  // Why: pasting is how most people attach a screenshot, and the limits (type, count) must be explained before sending, not after a failure.
  await bugButton(page).click();
  const pictures = dialog(page).getByRole("list", { name: "Screenshots to send" }).getByRole("listitem");
  await pastePicture(dialog(page).getByLabel("What went wrong?"), "pasted.png");
  await expect(pictures).toHaveCount(1);

  const chooser = dialog(page).getByLabel("Choose screenshots");
  await chooser.setInputFiles([{ name: "notes.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4") }]);
  await expect(dialog(page)).toContainText("notes.pdf is not a PNG, JPEG or WebP picture.");
  await expect(pictures).toHaveCount(1);

  await chooser.setInputFiles(
    [2, 3, 4].map((n) => ({ name: `p${n}.png`, mimeType: "image/png", buffer: makePng(20, 20, [n * 40, 10, 10]) })),
  );
  await expect(pictures).toHaveCount(3);
  await expect(dialog(page)).toContainText("You can attach at most 3 screenshots.");
  await expect(dialog(page).getByRole("button", { name: "Add screenshots" })).toBeDisabled();
});

test("when sending fails, the person is told and what they typed is still there", async ({ loggedInPage: page }) => {
  // Why: a lost report is the worst outcome. A failure must be visible, must not close the form, and must not throw away the text.
  await page.route("**/api/v1/bug-reports", (route) =>
    route.fulfill({
      status: 502,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "report_not_sent", message: "We could not send your report. Please try again, or write to support@flowdesc.app." } }),
    }),
  );
  await bugButton(page).click();
  const text = dialog(page).getByLabel("What went wrong?");
  await text.fill("Please do not lose this sentence");
  await dialog(page).getByRole("button", { name: "Send report" }).click();
  await expect(dialog(page)).toContainText("We could not send your report");
  await expect(dialog(page)).toContainText("support@flowdesc.app");
  await expect(text).toHaveValue("Please do not lose this sentence");
  await expect(dialog(page).getByRole("button", { name: "Send report" })).toBeEnabled();
});

test("a stray click outside the form does not throw the text away, but Escape closes it", async ({ loggedInPage: page }) => {
  // Why: a form with typed text must survive a click on the dimmed area (ADR 0075), while the standard ways to leave still work.
  await bugButton(page).click();
  await dialog(page).getByLabel("What went wrong?").fill("Half a thought");
  await page.mouse.click(5, 5); // the dimmed area, far from the dialog
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
});

test("a demo copy has no bug button", async ({ page }) => {
  // Why: the server refuses reports from a demo copy (ADR 0044), so a visitor must not meet a button that can only fail.
  await page.goto("/");
  await page.getByRole("button", { name: "Try the demo" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "My work" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-tour="theme-switch"]')).toBeVisible();
  await expect(bugButton(page)).toHaveCount(0);
});
