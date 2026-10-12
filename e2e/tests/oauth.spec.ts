import type { Page } from "@playwright/test";
import { test, expect, logInThroughForm, TEST_USER } from "../support/fixtures";

/**
 * Sign in with Google / GitHub (ADR 0042), through the real browser, API and database. The e2e API runs with NODE_ENV=test,
 * where both providers are the fake in apps/api/src/lib/oauth/fake.ts: its "provider page" is the callback itself, with
 * the profile to sign in as taken from a cookie the test sets. Everything else (the state cookie, the redirects, the
 * session, linking, the account page) is the real code. What these tests CANNOT show: that real Google or GitHub accept
 * our credentials and answer the way the adapters expect (apps/api/src/lib/oauth/providers.test.ts covers the parsing).
 */

type Profile = { providerUserId: string; email: string; emailVerified: boolean; name: string };
const GINA: Profile = { providerUserId: "g-1", email: "gina@example.com", emailVerified: true, name: "Gina Google" };

/** The next provider sign-in is this person. */
async function actAs(page: Page, baseURL: string, profile: Profile) {
  await page.context().addCookies([{ name: "flowdesc_fake_oauth", value: encodeURIComponent(JSON.stringify(profile)), url: baseURL }]);
}

/**
 * After a provider sign-in the browser lands on `/` and the app signs itself in by refreshing the session (that rotates the
 * refresh token). Navigating away before that finishes would abort the request after the server rotated the token, so a
 * test waits for the page to know who the person is before it goes anywhere else.
 */
async function signedInAs(page: Page, name: string) {
  // My work greets by first name ("Good morning, Gina"), in the person's own time of day.
  await expect(page.getByText(new RegExp(`^Good (morning|afternoon|evening), ${name.split(" ")[0]}$`))).toBeVisible();
}

test("both provider buttons are on Login and on Create account", async ({ page }) => {
  // Why: the buttons are the entry point of the whole feature, and they come from the server's list of enabled providers.
  for (const path of ["/login", "/register"]) {
    await page.goto(path);
    await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continue with GitHub" })).toBeVisible();
  }
});

test("Continue with Google creates an account, signs in, and the account page shows it has no password yet", async ({ page, baseURL }) => {
  // Why: the first sign-in is also sign-up; the person must land in the app with a session, and the account page must
  // tell the truth: Google is the only way in, and a password can be added.
  await actAs(page, baseURL!, GINA);
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page).toHaveURL(/\/$/); // the app, not /login, with no tokens in the address
  await signedInAs(page, "Gina Google");
  expect(page.url()).not.toContain("code=");

  await page.goto("/account");
  await expect(page.getByText("gina@example.com").first()).toBeVisible();
  const google = page.locator('li[data-provider="google"]');
  await expect(google).toContainText("Connected as gina@example.com");
  await expect(google).toContainText("Your only way to sign in");
  await expect(google.getByRole("button", { name: "Disconnect Google" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Add password" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Change password" })).toHaveCount(0);
});

test("signing in with Google again after signing out returns to the same account", async ({ page, baseURL }) => {
  // Why: the second visit must find the account, not create another or fail on "already exists".
  await actAs(page, baseURL!, GINA);
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page).toHaveURL(/\/$/);
  await signedInAs(page, "Gina Google");
  await page.request.post("/api/v1/auth/logout"); // ends the session on the server and clears the cookie
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page).toHaveURL(/\/$/);
  await signedInAs(page, "Gina Google");
  await page.goto("/account");
  await expect(page.locator('li[data-provider="google"]')).toContainText("Connected as gina@example.com");
});

test("a Google-only account adds a password, can then disconnect Google, and logs in with email and password", async ({ page, baseURL }) => {
  // Why: the lock-out guard and its way out, end to end: the last method cannot go until a password exists, and the
  // password must really work for a normal login afterwards.
  await actAs(page, baseURL!, GINA);
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page).toHaveURL(/\/$/);
  await signedInAs(page, "Gina Google");
  await page.goto("/account");

  await page.getByLabel("New password", { exact: true }).fill(TEST_USER.password);
  await page.getByLabel("Repeat the password", { exact: true }).fill(TEST_USER.password);
  await page.getByRole("button", { name: "Add password" }).click();
  await expect(page.getByRole("button", { name: "Change password" })).toBeVisible(); // the section switched

  const google = page.locator('li[data-provider="google"]');
  await google.getByRole("button", { name: "Disconnect Google" }).click();
  await page.getByRole("button", { name: "Yes, disconnect Google" }).click();
  await expect(google).toContainText("Not connected");

  await page.context().clearCookies();
  await logInThroughForm(page, "gina@example.com");
});

test("a password account connects GitHub from the account page and disconnects it again", async ({ loggedInPage: page, baseURL }) => {
  // Why: the "link" intent needs the signed-in person's identity through the redirect round trip, and must come back to
  // the account page with a confirmation.
  await actAs(page, baseURL!, { providerUserId: "gh-9", email: TEST_USER.email, emailVerified: true, name: "Gh Person" });
  await page.goto("/account");
  const github = page.locator('li[data-provider="github"]');
  await expect(github).toContainText("Not connected");
  await github.getByRole("button", { name: "Connect GitHub" }).click();

  await expect(page).toHaveURL(/\/account\?connected=github/);
  await expect(page.getByRole("status").filter({ hasText: "GitHub connected" })).toBeVisible();
  await expect(github).toContainText(`Connected as ${TEST_USER.email}`);

  await github.getByRole("button", { name: "Disconnect GitHub" }).click();
  await page.getByRole("button", { name: "Yes, disconnect GitHub" }).click();
  await expect(github).toContainText("Not connected");
});

test("a provider email that is not verified ends on the login page with a message that can be dismissed", async ({ page, baseURL }) => {
  // Why: a failed sign-in must say why instead of dropping the person on a blank or broken page, and a reload after
  // Dismiss must not show it again.
  await actAs(page, baseURL!, { ...GINA, emailVerified: false });
  await page.goto("/login");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page).toHaveURL(/\/login\?oauth_error=oauth_email_unverified/);
  const alert = page.getByRole("alert").filter({ hasText: "has not verified your email address" });
  await expect(alert).toBeVisible();

  await alert.getByRole("button", { name: "Dismiss" }).click();
  await expect(alert).toHaveCount(0);
  await expect(page).toHaveURL(/\/login$/);
});

test("an unknown oauth_error code in the address still shows a general message", async ({ page }) => {
  // Why: the code comes from the URL, which anyone can edit; it must never show raw text or break the page.
  await page.goto("/login?oauth_error=<b>boom</b>");
  await expect(page.getByRole("alert")).toContainText("Sign-in did not finish. Please try again.");
  await expect(page.getByRole("alert")).not.toContainText("boom");
});
