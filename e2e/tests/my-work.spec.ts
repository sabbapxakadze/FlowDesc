import type { Page } from "@playwright/test";
import { test, expect, logInThroughForm } from "../support/fixtures";
import { apiSession, createIssueViaApi } from "../support/api";
import { addOrgMember } from "../support/db";

/**
 * "My work", the page `/` opens: the open issues assigned to me across projects, and my unread notifications. Since ADR 0057 it is a
 * header with a greeting and a week ring, the week as an agenda, and a right side with what is overdue, the notifications and what changed.
 */

async function myId(page: Page) {
  const { headers, base } = await apiSession(page.request);
  const members = await (await page.request.get(`${base}/members`, { headers })).json();
  return { me: members.data[0].userId as string, headers, base };
}

async function assign(page: Page, projectId: string, issueId: string, userId: string, status?: string, dueDate?: string) {
  const { headers, base } = await apiSession(page.request);
  const res = await page.request.patch(`${base}/projects/${projectId}/issues/${issueId}`, {
    headers,
    data: { version: 1, assigneeId: userId, ...(status ? { status } : {}), ...(dueDate ? { dueDate } : {}) },
  });
  expect(res.status()).toBe(200);
}

/** The calendar day in the browser's own timezone (what the page calls "today" when no account timezone is set), moved by `days`. */
async function browserDay(page: Page, days = 0) {
  const today = await page.evaluate(() => new Intl.DateTimeFormat("en-CA").format(new Date()));
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}


test("/ is My work: my open issues from every project with the project named, and not finished or other people's", async ({
  loggedInPage: page,
}) => {
  // Why: the feature. The page used to be a redirect to the project list.
  const web = await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: ["Mine in web", "Not mine", "Mine but done"] });
  const api = await createIssueViaApi(page.request, { projectName: "Backend API", projectKey: "API", titles: ["Mine in api"] });
  const { me } = await myId(page);
  await assign(page, web.projectId, web.issueIds[0]!, me);
  await assign(page, web.projectId, web.issueIds[2]!, me, "done");
  await assign(page, api.projectId, api.issueIds[0]!, me);

  await page.goto("/");
  await expect(page).toHaveURL(/\/$/); // not redirected away
  await expect(page.getByRole("heading", { level: 1, name: "My work" })).toBeVisible();
  const assigned = page.getByRole("region", { name: "Assigned to me" });
  await expect(page.getByText("2 open issues")).toBeVisible(); // the header's count
  await expect(assigned.getByRole("link", { name: /Mine in web/ })).toContainText("Website");
  await expect(assigned.getByRole("link", { name: /Mine in api/ })).toContainText("Backend API");
  await expect(assigned.getByText("Not mine")).toHaveCount(0);
  await expect(assigned.getByText("Mine but done")).toHaveCount(0);

  // A row opens the issue in the side panel (ADR 0025), not on its own page.
  await assigned.getByRole("link", { name: /Mine in web/ }).click();
  await expect(page).toHaveURL(/\/\?issue=WEB-1$/);
  await expect(page.getByRole("dialog", { name: "Issue", exact: true })).toContainText("Mine in web");
});

test("the sidebar's My work link and the logo both go to it", async ({ loggedInPage: page }) => {
  // Why: the page needs a way in now that login still lands on Projects.
  await page.goto("/projects");
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("link", { name: "My work" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(nav.getByRole("link", { name: "My work" })).toHaveAttribute("aria-current", "page");
  await page.goto("/projects");
  await page.getByRole("link", { name: "FlowDesc" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("with nothing assigned and nothing unread, it says so", async ({ loggedInPage: page }) => {
  // Why: the empty states are the first thing a new person sees.
  await page.goto("/");
  await expect(page.getByRole("region", { name: "Assigned to me" })).toContainText("Nothing is assigned to you");
  await expect(page.getByRole("region", { name: "Unread notifications" })).toContainText("all caught up");
});

test("a comment from someone else shows as unread here, clicking it opens the issue and clears it", async ({
  loggedInPage: owner,
  browser,
}) => {
  // Why: the notifications section is the bell's own list; reading one here must clear it in the bell too.
  const { projectId, issueIds } = await createIssueViaApi(owner.request, { projectName: "Website", projectKey: "WEB", titles: ["Needs attention"] });
  await addOrgMember("e2e-user@example.com", { email: "e2e-second@example.com", name: "Second Person" });
  // The owner has to take part to be notified: one comment of their own first.
  await owner.goto(`/projects/${projectId}/issues/${issueIds[0]}`);
  await owner.getByRole("textbox", { name: "Comment", exact: true }).fill("First, from the owner");
  await owner.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(owner.getByText("First, from the owner")).toBeVisible();

  const ctx = await browser.newContext();
  const other = await ctx.newPage();
  await logInThroughForm(other, "e2e-second@example.com");
  await other.goto(`/projects/${projectId}/issues/${issueIds[0]}`);
  await other.getByRole("textbox", { name: "Comment", exact: true }).fill("Hello from Second");
  await other.getByRole("button", { name: "Comment", exact: true }).click();
  await expect(other.getByText("Hello from Second")).toBeVisible();

  await owner.goto("/");
  const unread = owner.getByRole("region", { name: "Unread notifications" });
  await expect(unread.getByRole("heading", { name: /Unread notifications/ })).toContainText("1");
  const row = unread.getByRole("button", { name: /Second Person/ });
  await expect(row).toContainText("WEB-1");
  await expect(row).toContainText("Needs attention");
  await row.click();
  await expect(owner).toHaveURL(/\/projects\/WEB\/issues\/WEB-1$/);

  await owner.goto("/");
  await expect(owner.getByRole("region", { name: "Unread notifications" })).toContainText("all caught up");
  await expect(owner.getByRole("button", { name: /^Notifications/ })).not.toContainText("1");
  await ctx.close();
});

test("signed out, My work is not shown: / is the public landing page (ADR 0043)", async ({ page }) => {
  // Why: My work is behind the login like every other app page. A visitor at / used to be redirected to the login page; now they
  // see the landing page instead (landing.spec.ts covers it), and still never My work.
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Plan the work. Follow it through." })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "My work" })).toHaveCount(0);
});

test("the week ring counts what is due this week and finished", async ({ loggedInPage: page }) => {
  // Why: done issues are gone from the open list, so the ring has its own query; this checks its numbers through the real page (one of two finished).
  const { projectId, issueIds } = await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: ["Done today", "Still open"] });
  const { me, headers, base } = await myId(page);
  const today = await browserDay(page);
  for (const id of issueIds) await assign(page, projectId, id, me, undefined, today);
  const finished = await page.request.patch(`${base}/projects/${projectId}/issues/${issueIds[0]}`, { headers, data: { version: 2, status: "done" } });
  expect(finished.status()).toBe(200);

  await page.goto("/");
  await expect(page.getByRole("img", { name: "1 of 2 done" })).toBeVisible();
});

test("on a wide screen the page does not scroll: the week and the right side scroll inside their own areas", async ({ loggedInPage: page }) => {
  // Why: the owner wants My work to fit the window. Long lists scroll in their own boxes (the week, and overdue plus notifications), never the page.
  const titles = Array.from({ length: 16 }, (_, index) => `Task ${index + 1}`);
  const { projectId, issueIds } = await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles });
  const { me } = await myId(page);
  const yesterday = await browserDay(page, -1);
  for (const [index, id] of issueIds.entries()) await assign(page, projectId, id, me, undefined, index < 6 ? yesterday : undefined);

  await page.setViewportSize({ width: 1440, height: 700 });
  await page.goto("/");
  await expect(page.getByRole("group", { name: "Week and issues" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Needs you today" })).toContainText("6 overdue");
  const sizes = await page.evaluate(() => {
    const box = (name: string) => {
      const element = document.querySelector(`[aria-label="${name}"]`) as HTMLElement;
      return { scroll: element.scrollHeight, client: element.clientHeight };
    };
    return { page: document.documentElement.scrollHeight - window.innerHeight, week: box("Week and issues"), side: box("Overdue and notifications") };
  });
  expect(sizes.page).toBeLessThanOrEqual(0); // the page itself has nothing to scroll
  expect(sizes.week.scroll).toBeGreaterThan(sizes.week.client);
  expect(sizes.side.scroll).toBeGreaterThan(sizes.side.client);
});

test("the week moves with Previous, Next and Today, kept in the address, and a bad ?week= shows this week", async ({ loggedInPage: page }) => {
  // Why: the shown week is state a person may bookmark or send; it lives in the URL like the analytics ranges, and typing nonsense must not break the page.
  const { projectId, issueIds } = await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: ["Mine"] });
  const { me } = await myId(page);
  await assign(page, projectId, issueIds[0]!, me);

  await page.goto("/");
  const agenda = page.getByRole("region", { name: "Assigned to me" });
  await expect(agenda.getByRole("heading", { name: /^This week/ })).toBeVisible();
  await agenda.getByRole("button", { name: "Next" }).click();
  await expect(page).toHaveURL(/\/\?week=\d{4}-\d{2}-\d{2}$/);
  await expect(agenda.getByRole("heading", { name: /^Next week/ })).toBeVisible();
  await agenda.getByRole("button", { name: "Today" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(agenda.getByRole("heading", { name: /^This week/ })).toBeVisible();

  await page.goto("/?week=garbage");
  await expect(agenda.getByRole("heading", { name: /^This week/ })).toBeVisible();
});

test("New issue on My work asks which project when there are several, then opens the usual popup", async ({ loggedInPage: page }) => {
  // Why: My work is not inside a project, so the popup needs one; with a choice made, the issue must land in THAT project.
  await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: ["Seed web"] });
  await createIssueViaApi(page.request, { projectName: "Backend API", projectKey: "API", titles: ["Seed api"] });

  await page.goto("/");
  await page.getByRole("button", { name: "New issue" }).click();
  const choose = page.getByRole("dialog", { name: "New issue" });
  await choose.getByRole("combobox", { name: /Project/ }).click();
  await page.getByRole("option", { name: /Backend API/ }).click();
  await choose.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("textbox", { name: "Title" }).fill("Made from My work");
  await page.getByRole("button", { name: "Add issue" }).click();

  await page.goto("/projects/API");
  await expect(page.getByText("Made from My work")).toBeVisible();
  await page.goto("/projects/WEB");
  await expect(page.getByText("Made from My work")).toHaveCount(0);
});

test("the side panel opens from My work, another tile swaps it, Esc closes it, and Open full page goes to the page", async ({ loggedInPage: page }) => {
  // Why: every other page opens issues in the panel; My work used to be the odd one out. The project comes from the key in the address.
  const web = await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: ["First one", "Second one"] });
  const { me } = await myId(page);
  for (const id of web.issueIds) await assign(page, web.projectId, id, me);

  await page.goto("/");
  const panel = page.getByRole("dialog", { name: "Issue", exact: true });
  await page.getByRole("region", { name: "Assigned to me" }).getByRole("link", { name: /First one/ }).click();
  await expect(panel).toContainText("First one");
  await page.getByRole("region", { name: "Assigned to me" }).getByRole("link", { name: /Second one/ }).click();
  await expect(panel).toContainText("Second one"); // swapped, not closed
  await expect(page).toHaveURL(/\?issue=WEB-2$/);
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/?issue=WEB-1"); // a reload (or a shared link) keeps it open
  await expect(panel).toContainText("First one");
  await panel.getByRole("link", { name: /Open full page/ }).click();
  await expect(page).toHaveURL(/\/projects\/WEB\/issues\/WEB-1$/);
});

test("an overdue issue shows on its own day when you go back to that week, and is also in Needs you today", async ({ loggedInPage: page }) => {
  // Why: overdue issues used to be only in the right-hand card, so the calendar said "Nothing due" for days that had open work. Found by the owner.
  const { projectId, issueIds } = await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: ["Late one"] });
  const { me } = await myId(page);
  const due = await browserDay(page, -9); // always before today, and at least one week back
  await assign(page, projectId, issueIds[0]!, me, undefined, due);
  const weekday = new Date(`${due}T00:00:00Z`).getUTCDay();
  const date = new Date(`${due}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - ((weekday + 6) % 7));
  const monday = date.toISOString().slice(0, 10);

  await page.goto(`/?week=${monday}`);
  const agenda = page.getByRole("region", { name: "Assigned to me" });
  await expect(agenda.getByRole("link", { name: /Late one/ })).toContainText("Overdue");
  await expect(page.getByRole("region", { name: "Needs you today" })).toContainText("Late one");
});

test("a change made anywhere shows on My work at once, with no reload", async ({ loggedInPage: page }) => {
  // Why: the page used to re-read only when opened, so an edit (in the panel, on the board, by someone else) needed a reload. It now joins the
  // room of every project; the changes below come in through the API, as another person's would.
  const { projectId, issueIds } = await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: ["First one", "Second one"] });
  const { me, headers, base } = await myId(page);
  await assign(page, projectId, issueIds[0]!, me);

  await page.goto("/");
  const agenda = page.getByRole("region", { name: "Assigned to me" });
  await expect(agenda.getByRole("link", { name: /First one/ })).toBeVisible();
  await expect(agenda.getByRole("link", { name: /Second one/ })).toHaveCount(0);

  await assign(page, projectId, issueIds[1]!, me); // newly assigned to me: appears
  await expect(agenda.getByRole("link", { name: /Second one/ })).toBeVisible();

  const finished = await page.request.patch(`${base}/projects/${projectId}/issues/${issueIds[0]}`, { headers, data: { version: 2, status: "done" } });
  expect(finished.status()).toBe(200); // finished elsewhere: leaves
  await expect(agenda.getByRole("link", { name: /First one/ })).toHaveCount(0);

  const renamed = await page.request.patch(`${base}/projects/${projectId}/issues/${issueIds[1]}`, { headers, data: { version: 2, title: "Second, renamed" } });
  expect(renamed.status()).toBe(200);
  await expect(agenda.getByRole("link", { name: /Second, renamed/ })).toBeVisible();
});

test("with the side panel open on a medium window the columns stack instead of being squeezed, with nothing scrolling sideways", async ({ loggedInPage: page }) => {
  // Why: the page chose two columns by the window's width, so at about 1270px with the 31rem side panel open each column got a few hundred pixels:
  // titles broke after a word and every list grew a sideways scrollbar. It now chooses by the width its content really has.
  const { projectId, issueIds } = await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: ["A fairly long issue title that needs room to read properly"] });
  const { me } = await myId(page);
  await assign(page, projectId, issueIds[0]!, me, undefined, await browserDay(page, -1));
  const boxes = async () => {
    const agenda = page.getByRole("group", { name: "Week and issues" });
    const side = page.getByRole("group", { name: "Overdue and notifications" });
    await expect(agenda).toBeVisible();
    await expect(side).toBeVisible();
    return { agenda: (await agenda.boundingBox())!, side: (await side.boundingBox())!, agendaEl: agenda, sideEl: side };
  };
  const noSidewaysScroll = (element: import("@playwright/test").Locator) => element.evaluate((node) => node.scrollWidth <= node.clientWidth);

  await page.setViewportSize({ width: 1270, height: 850 });
  await page.goto("/?issue=WEB-1");
  await expect(page.getByRole("dialog", { name: "Issue", exact: true })).toBeVisible();
  const narrow = await boxes();
  expect(narrow.side.x).toBeCloseTo(narrow.agenda.x, 0); // stacked: the same left edge
  expect(narrow.side.y).toBeGreaterThan(narrow.agenda.y);
  expect(narrow.agenda.width).toBeGreaterThan(380);
  expect(await noSidewaysScroll(narrow.agendaEl)).toBe(true);
  expect(await noSidewaysScroll(narrow.sideEl)).toBe(true);

  await page.setViewportSize({ width: 1440, height: 850 });
  await page.goto("/");
  const wide = await boxes();
  expect(wide.side.x).toBeGreaterThan(wide.agenda.x + wide.agenda.width - 1); // two columns, side by side
});
