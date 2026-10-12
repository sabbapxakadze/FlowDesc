import type { Page } from "@playwright/test";
import { test, expect, logInThroughForm, TEST_USER } from "../support/fixtures";
import { addOrgMember } from "../support/db";
import { combobox, inviteRole, pick } from "../support/dropdown";

const membersList = (page: Page) => page.getByRole("list", { name: "Members", exact: true });
const pendingList = (page: Page) => page.getByRole("list", { name: "Pending invitations" });

async function invite(page: Page, email: string, role: "Member" | "Admin" | "Viewer" = "Member") {
  await page.getByLabel("Email").fill(email);
  await pick(inviteRole(page), role);
  await page.getByRole("button", { name: "Send invitation" }).click();
}

test("an owner invites someone, they join through the link, and the owner sees them appear without reloading", async ({
  loggedInPage: owner,
  browser,
}) => {
  // Why: the whole slice end to end with real people: the invite form, the one-time
  // link and its Copy button, the public accept page, signing in as the new person,
  // and the live refresh of the owner's open page (the org:changed "members" event).
  await owner.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await owner.goto("/members");
  await expect(membersList(owner)).toContainText("E2E User");
  await expect(pendingList(owner)).toHaveCount(0); // empty state instead of a list
  await expect(owner.getByText("No pending invitations.")).toBeVisible();

  await invite(owner, "newbie@example.com");
  const link = owner.getByLabel("Invitation link");
  await expect(link).toBeVisible();
  const url = await link.inputValue();
  expect(url).toMatch(/\/invite\?token=/);

  await owner.getByRole("button", { name: "Copy link" }).click();
  await expect(owner.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await owner.evaluate(() => navigator.clipboard.readText())).toBe(url);

  await owner.getByRole("button", { name: "Invite someone else" }).click();
  await expect(pendingList(owner)).toContainText("newbie@example.com");
  await expect(pendingList(owner)).toContainText("Member");
  await expect(pendingList(owner)).toContainText("Invited by E2E User");

  // The new person: a fresh browser with no session.
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(url);
  await expect(guest.getByText(`${TEST_USER.name} invited you to join`)).toBeVisible();
  await expect(guest.getByText(TEST_USER.organizationName, { exact: true })).toBeVisible();
  await expect(guest.getByLabel("Email")).toHaveValue("newbie@example.com");
  await expect(guest.getByLabel("Email")).not.toBeEditable(); // fixed to the invited address

  // A too-short password is refused by the form before anything is sent.
  await guest.getByLabel("Name").fill("Newbie Person");
  await guest.getByLabel("Password", { exact: true }).fill("short");
  await guest.getByRole("button", { name: "Join" }).click();
  await expect(guest.getByText("Password must be at least 8 characters")).toBeVisible();

  await guest.getByLabel("Password", { exact: true }).fill(TEST_USER.password);
  await guest.getByRole("button", { name: "Join" }).click();
  await expect(guest.getByText(`Welcome to ${TEST_USER.organizationName}`)).toBeVisible();

  // The owner's already-open page updates by itself: new member in, invitation gone.
  await expect(membersList(owner)).toContainText("Newbie Person");
  await expect(owner.getByText("No pending invitations.")).toBeVisible();

  // The link works once.
  await guest.goto(url);
  await expect(guest.getByText("This invitation is invalid or has expired.")).toBeVisible();

  // They can sign in, and land in the inviter's organization with the invited role.
  await logInThroughForm(guest, "newbie@example.com");
  await guest.goto("/members");
  const me = membersList(guest).getByRole("listitem").filter({ hasText: "Newbie Person" });
  await expect(me).toContainText("(you)");
  await expect(me).toContainText("Member");
  await expect(membersList(guest)).toContainText("E2E User");
  // A plain member sees the list but not the invite form or the pending invitations.
  await expect(guest.getByRole("button", { name: "Send invitation" })).toHaveCount(0);
  await expect(guest.getByRole("heading", { name: "Pending invitations" })).toHaveCount(0);

  await guestContext.close();
});

test("revoking an invitation kills its link", async ({ loggedInPage: owner, browser }) => {
  // Why: revoking has to actually stop the link, not just hide the row.
  await owner.goto("/members");
  await invite(owner, "regret@example.com", "Viewer");
  const url = await owner.getByLabel("Invitation link").inputValue();
  await owner.getByRole("button", { name: "Invite someone else" }).click();

  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  await guest.goto(url);
  await expect(guest.getByText("invited you to join")).toBeVisible();
  await expect(guest.getByText("as a viewer")).toBeVisible();

  await pendingList(owner)
    .getByRole("listitem")
    .filter({ hasText: "regret@example.com" })
    .getByRole("button", { name: "Revoke" })
    .click();
  await expect(owner.getByText("No pending invitations.")).toBeVisible();

  await guest.reload();
  await expect(guest.getByText("This invitation is invalid or has expired.")).toBeVisible();
  await expect(guest.getByRole("button", { name: "Join" })).toHaveCount(0);
  await guestContext.close();
});

test("a plain member sees the member list but no way to invite", async ({ loggedInPage: page }) => {
  // Why: the invite form and pending list are owner/admin-only, and a member must not
  // be offered a button the API would refuse (the API side is covered by its own tests).
  await addOrgMember(TEST_USER.email, { email: "e2e-second@example.com", name: "Second Person" });
  await logInThroughForm(page, "e2e-second@example.com");
  await page.goto("/members");
  await expect(membersList(page)).toContainText("Second Person");
  await expect(membersList(page)).toContainText("E2E User");
  await expect(page.getByRole("button", { name: "Send invitation" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Pending invitations" })).toHaveCount(0);
});

test("inviting someone who is already a member, or who already has an account, says so plainly", async ({
  loggedInPage: page,
}) => {
  // Why: Option A (ADR 0024): only people without an account can be invited. The
  // refusal must be a clear sentence, not a generic failure.
  await addOrgMember(TEST_USER.email, { email: "e2e-second@example.com", name: "Second Person" });
  await page.request.post("/api/v1/auth/register", {
    data: {
      email: "elsewhere@example.com",
      password: TEST_USER.password,
      name: "Elsewhere",
      organizationName: "Their Org",
    },
  });
  await page.goto("/members");

  await invite(page, "e2e-second@example.com");
  await expect(page.getByText("already a member of the organization")).toBeVisible();

  await invite(page, "elsewhere@example.com");
  await expect(page.getByText("already has a FlowDesc account")).toBeVisible();

  // A second invitation to an address that still has an open one is refused.
  await invite(page, "fresh@example.com");
  await expect(page.getByLabel("Invitation link")).toBeVisible();
  await page.getByRole("button", { name: "Invite someone else" }).click();
  await invite(page, "fresh@example.com");
  await expect(page.getByText("has already been invited")).toBeVisible();
});

test("a broken or missing invitation link shows one plain message and no form", async ({ page }) => {
  await page.goto("/invite?token=not-a-real-token");
  await expect(page.getByText("This invitation is invalid or has expired.")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);

  await page.goto("/invite");
  await expect(page.getByText("This invitation link is incomplete.")).toBeVisible();
  await expect(page.getByLabel("Password", { exact: true })).toHaveCount(0);
});

test("the list is grouped by role with the owner first, and changing someone's role moves them to their group", async ({ loggedInPage: page }) => {
  // Why: the grouping is the point of the page (ADR 0060). A group with nobody in it is not drawn, and a role change must move the person, not just relabel them.
  await addOrgMember(TEST_USER.email, { email: "e2e-second@example.com", name: "Second Person" });
  await page.goto("/members");
  const text = async () => (await membersList(page).innerText()).toLowerCase();
  let t = await text();
  expect(t.indexOf("owner and admins")).toBeGreaterThanOrEqual(0);
  expect(t.indexOf("e2e user")).toBeGreaterThan(t.indexOf("owner and admins"));
  expect(t.indexOf("second person")).toBeGreaterThan(t.indexOf("members", t.indexOf("e2e user")));
  expect(t).not.toContain("viewers"); // nobody is a viewer yet

  await pick(combobox(page, "Role of Second Person"), "Viewer");
  await expect(membersList(page)).toContainText(/viewers/i);
  t = await text();
  expect(t.indexOf("viewers")).toBeLessThan(t.indexOf("second person"));
  expect(t.indexOf("members", t.indexOf("e2e user"))).toBe(-1); // the Members group is empty now, so it is gone
});
