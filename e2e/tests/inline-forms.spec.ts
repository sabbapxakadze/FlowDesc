import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { createIssueViaApi } from "../support/api";

/** Where every label, input and the submit button of a form are, as plain numbers. */
async function layoutOf(page: Page, submitName: string) {
  const form = page.locator("form").filter({ has: page.getByRole("button", { name: submitName }) });
  const boxes = async (selector: string) =>
    Promise.all((await form.locator(selector).all()).map(async (el) => (await el.boundingBox())!));
  const round = (b: { x: number; y: number; width: number; height: number }) =>
    [b.x, b.y, b.width, b.height].map((n) => Math.round(n * 10) / 10);
  return {
    form: round((await form.boundingBox())!),
    labels: (await boxes("label")).map(round),
    inputs: (await boxes("input")).map(round),
    button: round((await form.getByRole("button", { name: submitName }).boundingBox())!),
  };
}

test("pressing Submit on an empty inline create form moves nothing: not the labels, the inputs, the button or the card", async ({
  loggedInPage: page,
}) => {
  // Why: the validation message used to take a line under one field only, making it taller; the
  // fields and the button bottom-aligned next to it then slid down and out of line with their
  // labels. Each field now keeps one line for its error, so an error appears without any reflow.
  const { projectId } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: [],
  });

  const forms = [
    { url: `/projects/${projectId}/sprints`, submit: "Create sprint", error: "Name is required", opener: "New sprint" },
  ];
  for (const { url, submit, error, opener } of forms) {
    await page.goto(url);
    await page.getByRole("button", { name: opener }).click(); // the form lives in a popup
    const button = page.getByRole("button", { name: submit });
    await expect(button).toBeVisible();
    const before = await layoutOf(page, submit);
    await button.click();
    await expect(page.getByText(error).first()).toBeVisible();
    expect(await layoutOf(page, submit), `${submit}: layout changed when the error appeared`).toEqual(before);
    // The popup form stacks its fields, so the button sits below the last input, never beside it.
    const input = before.inputs.at(-1)!;
    expect(before.button[1]!).toBeGreaterThanOrEqual(input[1]! + input[3]!);
  }
});
