import type { Page } from "@playwright/test";
import { test, expect } from "../support/fixtures";
import { apiSession, createIssueViaApi } from "../support/api";

/**
 * The project's analytics page (ADR 0064). The numbers themselves are tested at the API (the replay, the buckets, the velocity); this is the page:
 * the summary tiles agree with the data, the status card and the label list say where the work is, the period choice lives in the address, and the
 * table view still gives the numbers without the chart.
 */

/** Three issues: one finished (todo -> in progress -> done), one still in progress, one untouched. */
async function seed(page: Page) {
  const { projectId, issueIds } = await createIssueViaApi(page.request, {
    projectName: "Website",
    projectKey: "WEB",
    titles: ["Finished one", "Started one", "Waiting one"],
  });
  const { headers, base } = await apiSession(page.request);
  const patch = async (issueId: string, version: number, status: string) => {
    const res = await page.request.patch(
      `${base}/projects/${projectId}/issues/${issueId}`,
      { headers, data: { version, status } },
    );
    expect(res.status()).toBe(200);
  };
  await patch(issueIds[0]!, 1, "in_progress");
  await patch(issueIds[0]!, 2, "done");
  await patch(issueIds[1]!, 1, "in_progress");
}

test("the summary tiles and the status card agree with the work in the project, and the table view gives the numbers", async ({
  loggedInPage: page,
}) => {
  // Why: the tiles are sums and shares of the same data as the charts; a tile that disagrees with the chart under it would be worse than no tile.
  await seed(page);
  await page.goto("/projects/WEB/analytics");

  // One finished issue in 12 weeks is 0.1 a week; two open issues are one in progress and one to do.
  await expect(page.getByText("in 12 weeks, 0.1 a week")).toBeVisible();
  await expect(page.getByText("1 in progress, 1 to do")).toBeVisible();
  await expect(page.getByText("All 3 issues, right now")).toBeVisible();
  await expect(page.getByText("Open work is 2 of 3 issues: 67% of the project.")).toBeVisible();

  // The chart is a picture; the same numbers are one click away as a table.
  await page.getByRole("button", { name: "View as table" }).first().click();
  await expect(page.getByRole("columnheader", { name: "Completed" })).toBeVisible();
});

test("the period is a row of choices that lives in the address, and a reload keeps it", async ({
  loggedInPage: page,
}) => {
  // Why: the dropdown became a segmented control; the address (?weeks=) must still be the single source of truth, so a shared link shows the same range.
  await seed(page);
  await page.goto("/projects/WEB/analytics");
  const group = page.getByRole("radiogroup", {
    name: "Period for throughput and cycle time",
  });
  await expect(group.getByRole("radio", { name: "12 weeks" })).toBeChecked(); // the default

  await group.getByText("26 weeks").click();
  await expect(page).toHaveURL(/weeks=26/);
  await expect(group.getByRole("radio", { name: "26 weeks" })).toBeChecked();

  await page.reload();
  await expect(
    page
      .getByRole("radiogroup", { name: "Period for throughput and cycle time" })
      .getByRole("radio", { name: "26 weeks" }),
  ).toBeChecked();

  await group.getByText("12 weeks").click(); // choosing the default takes the parameter out again
  await expect(page).not.toHaveURL(/weeks=/);
});
