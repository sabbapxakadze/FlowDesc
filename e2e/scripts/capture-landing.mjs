// Retakes the landing page's screenshots (ADR 0043): apps/web/public/landing/{board,issues,analytics}-{light,dark}.jpg.
//
// Run `pnpm dev` first (web on :5173, API on :4000) with the demo organization seeded (`pnpm db:seed:demo`), then `pnpm landing:shots`.
// It logs in as the demo account and looks. So that the sidebar's "MCP" dot is GREEN in the pictures (ADR 0071, 0073), it makes one read-only
// access token named "landing screenshots", uses it once (a token counts as in use for five minutes after a request), takes the pictures, and
// REVOKES the token again at the end, also when something fails. Apart from that one revoked token in the demo account, it changes no data.
// Retake whenever the app's look changes, so the landing page
// does not show an old design. The landing page crops the bottom of each shot (a fade), so the sidebar's user name at the very bottom
// is not visible; check the result before committing anyway.
import { chromium } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.LANDING_BASE_URL ?? "http://localhost:5173";
const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "apps", "web", "public", "landing");
mkdirSync(OUT, { recursive: true });

const SCREENS = [
  { name: "board", url: "/projects/WEB/board", ready: (page) => page.getByText("In progress").first().waitFor() },
  { name: "issues", url: "/projects/WEB", ready: (page) => page.getByText(/^WEB-\d+$/).first().waitFor() },
  { name: "analytics", url: "/projects/WEB/analytics", ready: (page) => page.locator(".recharts-surface").first().waitFor() },
];

const browser = await chromium.launch();
try {
  for (const theme of ["light", "dark"]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: theme, reducedMotion: "reduce" });
    await context.addInitScript((value) => localStorage.setItem("flowdesc-theme", value), theme);
    const login = await context.request.post(`${BASE}/api/v1/auth/login`, { data: { email: "demo@flowdesc.test", password: "Demo123!@#" } });
    if (login.status() !== 200) throw new Error(`Could not log in as the demo account (HTTP ${login.status()}). Is the demo organization seeded?`);
    const page = await context.newPage();
    const { accessToken } = await login.json();
    const session = { Authorization: `Bearer ${accessToken}` };
    const made = await context.request.post(`${BASE}/api/v1/users/me/api-tokens`, {
      headers: session,
      data: { name: "landing screenshots", scope: "read", expiresInDays: 30 },
    });
    if (made.status() !== 201) throw new Error(`Could not make the screenshot token (HTTP ${made.status()}).`);
    const { token, data: tokenInfo } = await made.json();
    await context.request.get(`${BASE}/api/v1/users/me/context`, { headers: { Authorization: `Bearer ${token}` } }); // "used just now"
    try {
    for (const screen of SCREENS) {
      await page.goto(BASE + screen.url);
      await screen.ready(page);
      await page.addStyleTag({ content: ".tsqd-parent-container{display:none!important}" }); // the dev-only query devtools button
      await page.waitForTimeout(1200); // let charts and fades settle
      await page.screenshot({ path: join(OUT, `${screen.name}-${theme}.jpg`), type: "jpeg", quality: 85 });
      console.log(`saved ${screen.name}-${theme}.jpg`);
    }
    } finally {
      await context.request.delete(`${BASE}/api/v1/users/me/api-tokens/${tokenInfo.id}`, { headers: session });
    }
    await context.close();
  }
} finally {
  await browser.close();
}
