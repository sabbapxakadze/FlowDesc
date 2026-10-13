import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { apiSession, createIssueViaApi } from "../support/api";

async function sprintsInEveryState(page: Page) {
  const { projectId } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: [],
  });
  const { headers, base } = await apiSession(page.request);
  const sprints = `${base}/projects/${projectId}/sprints`;
  const make = async (name: string) => {
    const res = await page.request.post(sprints, { headers, data: { name } });
    expect(res.status()).toBe(201);
    return (await res.json()).data as { id: string; version: number };
  };
  const move = async (s: { id: string; version: number }, action: "start" | "complete") => {
    const res = await page.request.patch(`${sprints}/${s.id}/${action}`, { headers, data: { version: s.version } });
    expect(res.status()).toBe(200);
    return (await res.json()).data as { id: string; version: number };
  };
  const done = await make("Done sprint");
  await move(await move(done, "start"), "complete");
  await move(await make("Active sprint"), "start");
  await make("Planned sprint");
  return { projectId };
}

test("the Sprints page logs no React errors, also when no sprint is running", async ({ loggedInPage: page }) => {
  // Why: the "No sprint is running" message once put two paragraphs and a button inside one <p>. React warned ("<p> cannot contain a nested
  // <p>") and the browser re-arranges such markup. Nothing looked wrong, so only the console shows it: this test reads the console.
  const { projectId } = await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: ["Something"] });
  const { headers, base } = await apiSession(page.request);
  const planned = await page.request.post(`${base}/projects/${projectId}/sprints`, { headers, data: { name: "Planned sprint" } });
  expect(planned.status()).toBe(201); // a planned sprint and no running one: the message with a Start button
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/projects/WEB/sprints");
  await expect(page.getByText("No sprint is running.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start Planned sprint" })).toBeVisible();
  await page.waitForTimeout(500);
  expect(errors).toEqual([]);
});

test("the sprint strip tells each state apart, and Start waits while another sprint runs", async ({ loggedInPage: page }) => {
  // Why: the strip is how people read the project's sprints. A completed, an active and a planned sprint must each say what they are,
  // Delete must not be offered for the active one, and Start must be unavailable while a sprint is running (a project has only one).
  const { projectId } = await sprintsInEveryState(page);
  await page.goto(`/projects/${projectId}/sprints`);
  const strip = page.getByRole("list", { name: "Sprints" });
  const card = (name: string) => strip.getByRole("listitem").filter({ hasText: name });
  await expect(card("Done sprint")).toContainText("Completed");
  await expect(card("Active sprint")).toContainText("Active");
  await expect(card("Planned sprint")).toContainText("Planned");

  await expect(card("Planned sprint").getByRole("button", { name: "Start sprint" })).toBeDisabled();
  await expect(card("Done sprint").getByRole("button", { name: "Start sprint" })).toHaveCount(0);

  await card("Active sprint").getByRole("button", { name: "Active sprint options" }).click();
  await expect(page.getByRole("menuitem", { name: "Rename" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Delete" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await card("Done sprint").getByRole("button", { name: "Done sprint options" }).click();
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();
});

test("done issues are hidden in the backlog until Show done is on", async ({ loggedInPage: page }) => {
  // Why: completing a sprint sends its finished issues to the top of the backlog too; hidden by default keeps the backlog about what is left.
  const { projectId, issueIds } = await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: ["Open one", "Finished one"] });
  const { headers, base } = await apiSession(page.request);
  const res = await page.request.patch(`${base}/projects/${projectId}/issues/${issueIds[1]}`, { headers, data: { status: "done", version: 1 } });
  expect(res.status()).toBe(200);

  await page.goto(`/projects/${projectId}/sprints`);
  const backlog = page.getByRole("group", { name: "Backlog" });
  await expect(backlog.getByText("Open one")).toBeVisible();
  await expect(backlog.getByText("Finished one")).toHaveCount(0);
  await page.getByText(/Show done/).click(); // the switch's own checkbox is visually hidden; its label is the click target
  await expect(backlog.getByText("Finished one")).toBeVisible();
});
