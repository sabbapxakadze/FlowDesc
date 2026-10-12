import type { Page } from "@playwright/test";
import { test, expect, logInThroughForm, TEST_USER } from "../support/fixtures";
import { createIssueViaApi, setTimezoneViaApi } from "../support/api";
import { backdateAuditEvents } from "../support/db";
import { issueEmailChangeToken } from "../support/db";
import { combobox } from "../support/dropdown";

/**
 * The private account page: email (confirmed through a link to the new address), password (other devices signed out) and
 * timezone (the exact time on hover). Reached from Edit profile.
 */

const section = (page: Page, name: string) => page.getByRole("region", { name });
const NEW_PASSWORD = "a-brand-new-pass-1";

test("Account settings is reached from Edit profile and shows the email, password and timezone sections", async ({ loggedInPage: page }) => {
  // Why: the page needs a way in (profile settings, the owner's idea) and shows the current email and its state.
  await page.goto("/profile");
  await page.getByRole("main").getByRole("link", { name: /Account settings/ }).click(); // the sidebar has a link of this name too
  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();
  const email = section(page, "Email");
  await expect(email).toContainText(TEST_USER.email);
  await expect(email).toContainText("not verified yet"); // a new account: the verification link was never opened
  await expect(section(page, "Password")).toBeVisible();
  await expect(section(page, "Timezone")).toBeVisible();
});

test("changing the password needs the right current one, keeps this device logged in, signs the others out, and the new one logs in", async ({
  loggedInPage: page,
  browser,
}) => {
  // Why: a changed password must end the sessions that might belong to someone else, but not the one in use.
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await logInThroughForm(other); // the same person on another device

  await page.goto("/account");
  const password = section(page, "Password");
  await password.getByLabel("Current password").fill("not-my-password");
  await password.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD);
  await password.getByLabel("Repeat the new password").fill(NEW_PASSWORD);
  await password.getByRole("button", { name: "Change password" }).click();
  await expect(password.getByText("Current password is incorrect.")).toBeVisible();

  await password.getByLabel("Current password").fill(TEST_USER.password);
  await password.getByLabel("Repeat the new password").fill("something else");
  await password.getByRole("button", { name: "Change password" }).click();
  await expect(password.getByText("The two new passwords do not match")).toBeVisible();

  await password.getByLabel("Repeat the new password").fill(NEW_PASSWORD);
  await password.getByRole("button", { name: "Change password" }).click();
  await expect(password.getByRole("status")).toContainText("Password changed");

  await page.reload(); // this device carries on
  await expect(page.getByRole("heading", { level: 1, name: "Account" })).toBeVisible();

  await other.reload(); // the other device is signed out; it was on `/`, which now shows the landing page to anyone not signed in (ADR 0043)
  await expect(other.getByRole("heading", { level: 1, name: "Plan the work. Follow it through." })).toBeVisible();
  await otherContext.close();

  await page.goto("/login"); // (already logged in here, so use a clean context for the credential check)
  const fresh = await browser.newContext();
  const check = await fresh.newPage();
  await check.goto("/login");
  await check.getByLabel("Email").fill(TEST_USER.email);
  await check.getByLabel("Password", { exact: true }).fill(TEST_USER.password);
  await check.getByRole("button", { name: "Log in" }).click();
  await expect(check.getByText("Incorrect email or password.")).toBeVisible(); // the old password is dead
  await check.getByLabel("Password", { exact: true }).fill(NEW_PASSWORD);
  await check.getByRole("button", { name: "Log in" }).click();
  await expect(check).toHaveURL(/\/$/);
  await fresh.close();
});

test("\"Forgot it?\" on the Password section opens a popup for the signed-in address instead of leaving the page", async ({ loggedInPage: page }) => {
  // Why: a logged-in person must not be thrown onto the public login-side page; the address is already known.
  await page.goto("/account");
  await section(page, "Password").getByRole("button", { name: /Forgot it/ }).click();
  const dialog = page.getByRole("dialog", { name: "Reset your password by email" });
  await expect(dialog).toContainText(TEST_USER.email);
  await dialog.getByRole("button", { name: "Send reset link" }).click();
  await expect(dialog.getByRole("status")).toContainText("a reset link is on its way");
  await dialog.getByRole("button", { name: "Close" }).first().click();
  await expect(dialog).toBeHidden();
  await expect(page).toHaveURL(/\/account$/);
});

test("Sign out of all devices asks first, then ends this session and every other one", async ({ loggedInPage: page, browser }) => {
  // Why: the API existed with no button. It must ask before acting, and end the OTHER devices too (not only this one).
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await logInThroughForm(other); // the same person on another device

  await page.goto("/account");
  const devices = section(page, "Devices");
  await devices.getByRole("button", { name: "Sign out of all devices" }).click();
  await devices.getByRole("button", { name: "Cancel" }).click(); // asking first: nothing happened yet
  await expect(page).toHaveURL(/\/account$/);
  await devices.getByRole("button", { name: "Sign out of all devices" }).click();
  await devices.getByRole("button", { name: "Yes, sign out everywhere" }).click();
  await expect(page).toHaveURL(/\/login/);

  await other.reload(); // the other device's session is gone: it cannot refresh, so `/` shows the landing page (ADR 0043)
  await expect(other.getByRole("heading", { level: 1, name: "Plan the work. Follow it through." })).toBeVisible();
  await otherContext.close();
});

test("changing the email: the form asks for the password, says the link was sent, and the email changes only when the link is opened", async ({
  loggedInPage: page,
  browser,
}) => {
  // Why: nothing changes until the NEW address is confirmed, so a typo can never lock anyone out.
  await page.goto("/account");
  const email = section(page, "Email");
  await email.getByLabel("New email").fill("new-address@example.com");
  await email.getByLabel("Your password").fill("wrong-password");
  await email.getByRole("button", { name: "Send confirmation link" }).click();
  await expect(email.getByText("Password is incorrect.")).toBeVisible();

  await email.getByLabel("Your password").fill(TEST_USER.password);
  await email.getByRole("button", { name: "Send confirmation link" }).click();
  await expect(email.getByText(/We sent a confirmation link to/)).toContainText("new-address@example.com");
  await page.reload();
  const after = section(page, "Email");
  await expect(after).toContainText(TEST_USER.email); // still the old one
  await expect(after.getByRole("status")).toContainText("new-address@example.com"); // waiting for the link

  // Opening the link (the raw token only exists in the email, so the test makes its own).
  const token = await issueEmailChangeToken(TEST_USER.email, "new-address@example.com");
  const clean = await browser.newContext();
  const opened = await clean.newPage();
  await opened.goto(`/confirm-email-change?token=${token}`);
  await expect(opened.getByText("Your email was changed")).toBeVisible();
  await opened.goto(`/confirm-email-change?token=${token}`); // the same link twice
  await expect(opened.getByText(/invalid, has expired/)).toBeVisible();

  await page.reload();
  await expect(section(page, "Email")).toContainText("new-address@example.com");
  await expect(section(page, "Email")).toContainText("(verified)");
  await expect(section(page, "Email").getByRole("status")).toHaveCount(0);

  // The new address logs in; the old one no longer does.
  await opened.goto("/login");
  await opened.getByLabel("Email").fill(TEST_USER.email);
  await opened.getByLabel("Password", { exact: true }).fill(TEST_USER.password);
  await opened.getByRole("button", { name: "Log in" }).click();
  await expect(opened.getByText("Incorrect email or password.")).toBeVisible();
  await opened.getByLabel("Email").fill("new-address@example.com");
  await opened.getByRole("button", { name: "Log in" }).click();
  await expect(opened).toHaveURL(/\/$/);
  await clean.close();
});

test("a made-up, expired or reused confirmation link says so and changes nothing", async ({ loggedInPage: page }) => {
  // Why: the link is single use and expires.
  await page.goto("/confirm-email-change?token=not-a-real-token");
  await expect(page.getByText(/invalid, has expired/)).toBeVisible();
  const expired = await issueEmailChangeToken(TEST_USER.email, "late@example.com", -1000);
  await page.goto(`/confirm-email-change?token=${expired}`);
  await expect(page.getByText(/invalid, has expired/)).toBeVisible();
  await page.goto("/confirm-email-change");
  await expect(page.getByText(/invalid, has expired/)).toBeVisible();
});

test("the timezone can be chosen, shows the time there, is used for the exact time on hover, and survives a reload", async ({
  loggedInPage: page,
}) => {
  // Why: the exact time behind "5 minutes ago" is in the person's own timezone, not just the browser's.
  await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: [] }); // writes an audit row, which has a time
  await page.goto("/audit-log");
  const time = page.locator("time").first();
  await expect(time).toBeVisible();
  const before = await time.getAttribute("title");

  await page.goto("/account");
  const tz = combobox(page, "Timezone");
  await expect(tz).toContainText("Browser setting");
  await tz.click();
  await page.getByRole("searchbox", { name: "Search options" }).fill("Pacific/Kiritimati"); // UTC+14: far from any test machine's zone
  await page.getByRole("option", { name: "Pacific/Kiritimati" }).click();
  await expect(tz).toContainText("Pacific/Kiritimati");
  await expect(section(page, "Timezone")).toContainText("Now, in this timezone:");

  await page.reload();
  await expect(combobox(page, "Timezone")).toContainText("Pacific/Kiritimati"); // saved on the account

  await page.goto("/audit-log");
  const after = await page.locator("time").first().getAttribute("title");
  expect(after).not.toBe(before); // the same instant, written in another zone

  await page.goto("/account");
  await combobox(page, "Timezone").click();
  await page.getByRole("option", { name: /Browser setting/ }).click();
  await expect(combobox(page, "Timezone")).toContainText("Browser setting");
});

test("the sidebar has an Account settings link that opens the account page, and no link to the design-system page", async ({ loggedInPage: page }) => {
  // Why: the account page (email, password, timezone, sign-in methods) was only reachable through Edit profile. It is named "Account settings" so it
  // is never mistaken for a project's own Settings link, which sits higher in the same sidebar.
  await page.goto("/projects");
  const account = page.getByRole("link", { name: "Account settings", exact: true });
  await expect(account).toBeVisible();
  // The design-system page is for the owner and stays reachable by its address, but the app does not point people to it.
  await expect(page.getByRole("link", { name: "Design system" })).toHaveCount(0);
  await account.click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(account).toHaveAttribute("aria-current", "page");
});

test("a time older than a day is written as a date and time in the chosen timezone, and changes with it", async ({ loggedInPage: page }) => {
  // Why: "see your own time": after the first day the page shows the actual date and time (not only "3 days ago"), in the account's timezone, or the browser's.
  await createIssueViaApi(page.request, { projectName: "Website", projectKey: "WEB", titles: [] }); // writes an audit row
  await backdateAuditEvents(3);
  await page.goto("/audit-log");
  const time = page.locator("time").first();
  await expect(time).toBeVisible();
  const browserText = (await time.innerText()).trim();
  expect(browserText).not.toMatch(/ago|just now/);
  expect(browserText).toMatch(/\d{1,2}:\d{2}/); // a clock time

  await setTimezoneViaApi(page.request, "Pacific/Kiritimati"); // UTC+14: far from any test machine's zone
  await page.goto("/audit-log");
  const inKiritimati = (await page.locator("time").first().innerText()).trim();
  expect(inKiritimati).not.toBe(browserText); // same instant, another zone
  expect(inKiritimati).toMatch(/\d{1,2}:\d{2}/);
  await setTimezoneViaApi(page.request, null);
});
