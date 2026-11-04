import { test, expect } from "../support/fixtures";
import { createIssueViaApi } from "../support/api";

/**
 * Dragging a card with a long list must not stall. dnd-kit re-renders every sortable item on every drag-over event; the
 * card bodies are memoised and the sensors' options are constants so those renders are skipped. With 80 cards the old
 * code had 200 to 280 ms main-thread stalls at the start and at the drop (measured 2026-10-05); now about 70 ms. The
 * limit is set between the two (150 ms), so a slow machine does not fail it but losing the memoisation does.
 */
// Tracing is off for this test only. A trace takes a snapshot of the whole page on every mouse action, inside the page, on the same thread the long-task
// observer is watching: with 60 moves over 80 cards that was a large part of the measured stall (found 2026-11-04 by profiling: `captureSnapshot` is the test
// tool's own code), and it grows as cards get richer, so the number drifted toward the limit on CI without the app getting slower.
test.use({ reducedMotion: "no-preference", viewport: { width: 1400, height: 900 }, trace: "off" });

test("dragging a card in an 80-issue column never blocks the page for long", async ({ loggedInPage: page }) => {
  const titles = Array.from({ length: 80 }, (_, i) => `Issue${i + 1}`);
  await createIssueViaApi(page.request, { projectName: "Perf", projectKey: "PRF", titles });
  await page.goto("/projects/PRF/board");
  const todo = page.getByRole("group", { name: "Todo", exact: true });
  const progress = page.getByRole("group", { name: "In progress", exact: true });
  await todo.getByRole("listitem").first().waitFor();
  await page.waitForTimeout(500);

  await page.evaluate(() => {
    const w = window as unknown as { __long: number[] };
    w.__long = [];
    new PerformanceObserver((list) => list.getEntries().forEach((e) => w.__long.push(e.duration))).observe({ entryTypes: ["longtask"] });
  });

  const from = (await todo.getByRole("listitem").first().boundingBox())!;
  const to = (await progress.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + from.width / 2 + 10, from.y + from.height / 2 + 10, { steps: 5 });
  await page.mouse.move(to.x + to.width / 2, to.y + 120, { steps: 60 });
  await page.mouse.up();
  await expect(progress).toContainText("Issue1"); // the drop happened
  await page.waitForTimeout(600);

  const longest = await page.evaluate(() => Math.max(0, ...(window as unknown as { __long: number[] }).__long));
  console.log("LONGEST-TASK-MS", Math.round(longest));
  expect(longest).toBeLessThan(150);
});
