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
  await page.getByRole("switch", { name: /Show done/ }).check();
  await expect(backlog.getByText("Finished one")).toBeVisible();
});
