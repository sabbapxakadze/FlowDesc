import { test, expect } from "../support/fixtures";

/**
 * The landing page (ADR 0043): what a visitor sees at `/` before logging in. It is rendered by RequireAuth for a logged-out visit to
 * `/` only. Logging out, or a session that ended, still goes to the login page; everything else behaves as before.
 */

test("a visitor at / sees the landing page and both ways in work", async ({ page }) => {
  // Why: it is the entry point of the whole site now; a visitor must read what the app is and reach Create account and Log in.
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Plan the work. Follow it through." })).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page).toHaveURL(/\/$/); // not sent on to /login

  await page.getByRole("link", { name: "Create account" }).first().click();
  await expect(page).toHaveURL(/\/register$/);
  await page.goBack();
  await page.getByRole("link", { name: "Log in" }).first().click();
  await expect(page).toHaveURL(/\/login$/);
});

test("a visitor at any other app page is still sent to the login page", async ({ page }) => {
  // Why: the landing page is for `/` only. Showing it on /projects, /members and the rest would hide the login page and leave
  // deep links (a bookmarked issue) pointing at a marketing page.
  for (const path of ["/projects", "/members", "/projects/WEB/board"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/login$/);
  }
});

test("the brand link on the login page leads back to the landing page", async ({ page }) => {
  // Why: the auth pages' "FlowDesc" link points at `/`, which used to bounce straight back to the login page.
  await page.goto("/login");
  await page.getByRole("link", { name: "FlowDesc" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Plan the work. Follow it through." })).toBeVisible();
});

test("a signed-in person at / still gets My work, not the landing page", async ({ loggedInPage: page }) => {
  // Why: the landing page must never replace the app for someone who is logged in.
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "My work" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Plan the work. Follow it through." })).toHaveCount(0);
});

test("logging out while on / goes to the login page, not the landing page", async ({ loggedInPage: page }) => {
  // Why: "Log out" has always ended on the login page (it fades in, ADR 0029); the new landing page at / must not change that.
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "My work" })).toBeVisible();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("after logging out, the Home button and the brand link lead to the landing page", async ({ loggedInPage: page }) => {
  // Why: logging out leaves the page loaded, and "signed-out" used to stay remembered, so `/` sent the person straight back to /login
  // and Home looked dead. Only a full reload worked.
  await page.goto("/");
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  for (const link of ["Home", "FlowDesc"]) {
    await page.getByRole("link", { name: link }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Plan the work. Follow it through." }), link).toBeVisible();
    await page.getByRole("link", { name: "Log in" }).first().click();
    await expect(page).toHaveURL(/\/login$/);
  }
});

test("a session that ends while on / goes to the login page with the message", async ({ loggedInPage: page }) => {
  // Why: an expired session is not "a visitor": the login page must say why, as in ADR 0038, even when the person was on /.
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "My work" })).toBeVisible();
  await page.route("**/api/v1/organizations/**", (route) =>
    route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ error: { code: "unauthenticated", message: "Invalid or expired access token." } }),
    }),
  );
  await page.context().clearCookies(); // the refresh cookie is gone, so renewing cannot work
  // A request made while still on `/`: searching from the command palette (Ctrl+K) does not leave the page.
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox").first().fill("anything");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText("Your session ended. Please log in again.")).toBeVisible();
});

test("the page has its sections, in order, with a sensible heading structure", async ({ page }) => {
  // Why: the page is the reason to visit; each section must be there, and the headings (one h1, then h2 sections, then h3 items)
  // are what screen-reader and keyboard users navigate by.
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible(); // the page is there (the session check on load has finished)
  const h2 = await page.getByRole("heading", { level: 2 }).allTextContents();
  expect(h2).toEqual([
    "One place for your team's work",
    "How it works",
    "What you get",
    "What people use it for",
    "Ready to look around?",
    "Built by Saba Pkhakadze",
  ]);
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("region", { name: "What you get" }).getByRole("listitem")).toHaveCount(8);
  await expect(page.getByRole("region", { name: "How it works" }).getByRole("listitem")).toHaveCount(3);
  await expect(page.getByRole("region", { name: "What people use it for" }).getByRole("listitem")).toHaveCount(4);
});

test("the preview switches between the three screens and follows the theme", async ({ page }) => {
  // Why: the preview is the proof of what the app is. Board first, a pill swaps the picture and its pressed state, and the picture
  // must be the dark one when the page is dark (a light screenshot on a dark page would look broken).
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  const picture = page.getByRole("img", { name: /^The FlowDesc / }); // the screenshot, not the "how it is organized" diagram
  const group = page.getByRole("group", { name: "Choose a screen" });
  await expect(group.getByRole("button", { name: "Board" })).toHaveAttribute("aria-pressed", "true");
  await expect(picture).toHaveAttribute("src", "/landing/board-light.jpg");

  await group.getByRole("button", { name: "Issues" }).click();
  await expect(group.getByRole("button", { name: "Issues" })).toHaveAttribute("aria-pressed", "true");
  await expect(group.getByRole("button", { name: "Board" })).toHaveAttribute("aria-pressed", "false");
  await expect(picture).toHaveAttribute("src", "/landing/issues-light.jpg");

  await page.getByRole("group", { name: "Theme" }).getByRole("button", { name: "Dark" }).click();
  await expect(picture).toHaveAttribute("src", "/landing/issues-dark.jpg");

  // The files really exist and are pictures.
  for (const file of ["board", "issues", "analytics"]) {
    for (const theme of ["light", "dark"]) {
      const res = await page.request.get(`/landing/${file}-${theme}.jpg`);
      expect(res.status(), `${file}-${theme}.jpg`).toBe(200);
      expect(res.headers()["content-type"]).toContain("image/jpeg");
    }
  }
});

test("the contact links are exactly the owner's email and phone", async ({ page }) => {
  // Why: a wrong digit or letter here would silently send people nowhere; the values are the owner's, typed once.
  await page.goto("/");
  await expect(page.getByRole("link", { name: "phkhakadze.saba49@gmail.com" })).toHaveAttribute("href", "mailto:phkhakadze.saba49@gmail.com");
  await expect(page.getByRole("link", { name: "+995 591917297" })).toHaveAttribute("href", "tel:+995591917297");
  await expect(page.getByText("© 2026 FlowDesc. All rights reserved.")).toBeVisible(); // the page's last line
});

test("on a phone the page does not scroll sideways, and the theme choice is remembered", async ({ page }) => {
  // Why: a wide frame or tile row is the usual way a landing page breaks on a phone; the theme switch must work before logging in.
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole("group", { name: "Theme" }).getByRole("button", { name: "Dark" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("the landing page only asks the server whether the demo is offered", async ({ page }) => {
  // Why: it is public and static. The only thing it may ask the server is whether "Try the demo" is on (a public, read-only answer, ADR 0044), besides
  // the app's usual silent session check on load; nothing else on it may need the server.
  const calls: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (url.includes("/api/v1/") && !url.endsWith("/api/v1/auth/refresh") && !url.includes("/auth/oauth/providers") && !url.endsWith("/api/v1/demo/info")) calls.push(url);
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForTimeout(500);
  expect(calls).toEqual([]);
});

test("the ways of working open one at a time, and the open one says which it is", async ({ page }) => {
  // Why: "What people use it for" is a row of tabs (ADR 0067). The first is open on arrival, choosing another swaps the text, and
  // the pressed state must follow, because it is how a screen reader hears which one is open.
  await page.goto("/");
  const tabs = page.getByRole("list", { name: "Ways of working" });
  await expect(tabs.getByRole("button", { name: "Run a sprint" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { level: 3, name: "Run a sprint" })).toBeVisible();

  await tabs.getByRole("button", { name: "Hand work over cleanly" }).click();
  await expect(tabs.getByRole("button", { name: "Hand work over cleanly" })).toHaveAttribute("aria-pressed", "true");
  await expect(tabs.getByRole("button", { name: "Run a sprint" })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("heading", { level: 3, name: "Hand work over cleanly" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "Run a sprint" })).toHaveCount(0);
});

test("the page has a tab icon, and every file it names (and the email logo) is served as an image", async ({ page, request }) => {
  // Why: the icon is the first thing in the browser tab, and the email logo is linked from every email we send. A renamed or missing file
  // fails silently (a default globe, a broken picture in an inbox), so this checks the links and that each file really answers.
  await page.goto("/");
  const hrefs = await page.locator('link[rel~="icon"], link[rel="apple-touch-icon"]').evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
  expect([...hrefs].sort()).toEqual(["/apple-touch-icon.png", "/favicon-32.png", "/favicon.svg"]);
  for (const href of [...hrefs, "/email-logo.png", "/email-lockup.png"]) {
    const res = await request.get(href);
    expect(res.status(), href).toBe(200);
    expect(res.headers()["content-type"], href).toMatch(/^image\//);
  }
});

test("the page says how it looks when shared, and the files for search engines and the share picture are served", async ({ page, request }) => {
  // Why: these tags and files are invisible on the page, so nothing else notices if they go missing or point at the wrong address. A shared link
  // would silently lose its picture, and search engines would lose the sitemap.
  await page.goto("/");
  const meta = (selector: string) => page.locator(selector).first().getAttribute("content");
  expect(await meta('meta[property="og:title"]')).toContain("FlowDesc");
  expect(await meta('meta[property="og:image"]')).toBe("https://flowdesc.app/og-image.png");
  expect(await meta('meta[name="twitter:card"]')).toBe("summary_large_image");
  expect((await meta('meta[name="description"]'))?.length ?? 0).toBeGreaterThan(50);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://flowdesc.app/");

  const image = await request.get("/og-image.png");
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toMatch(/^image\/png/);
  const robots = await request.get("/robots.txt");
  expect(await robots.text()).toContain("Sitemap: https://flowdesc.app/sitemap.xml");
  const sitemap = await request.get("/sitemap.xml");
  expect(await sitemap.text()).toContain("<loc>https://flowdesc.app/</loc>");
});
