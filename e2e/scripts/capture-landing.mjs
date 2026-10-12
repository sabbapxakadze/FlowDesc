// Retakes the landing page's screenshots (ADR 0043): apps/web/public/landing/{board,issues,analytics}-{light,dark}.jpg.
//
// Run `pnpm dev` first (web on :5173, API on :4000) with the demo organization seeded (`pnpm db:seed:demo`), then `pnpm landing:shots`.
// It only logs in as the demo account and looks; it changes no data. Retake whenever the app's look changes, so the landing page
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
    for (const screen of SCREENS) {
      await page.goto(BASE + screen.url);
      await screen.ready(page);
      await page.addStyleTag({ content: ".tsqd-parent-container{display:none!important}" }); // the dev-only query devtools button
      await page.waitForTimeout(1200); // let charts and fades settle
      await page.screenshot({ path: join(OUT, `${screen.name}-${theme}.jpg`), type: "jpeg", quality: 85 });
      console.log(`saved ${screen.name}-${theme}.jpg`);
    }
    await context.close();
  }
} finally {
  await browser.close();
}
