# 0064 - The analytics page: summary tiles, an area chart, committed next to completed

Status: **Accepted, built** - 2026-10-12. The owner chose the layout from four mockups (A to D), then asked for A's page with B's throughput chart ("E"). Builds on ADR 0009 to 0012 (what the numbers are); this ADR changes how they are shown, not what they are.

## Context

The page was five similar white bar charts in one color, each with a long caption and a "View as table" link, and nothing that said at a glance how the project was doing. The owner found it too plain. No API or schema change was needed: every figure shown already exists in the four analytics endpoints.

## Decisions

1. **A row of four summary tiles on top**, each a number with its unit, one line of what it is made of, and a small picture: *Completed* (the sum of the weekly throughput, and the average a week), *Typical cycle time* (the median, and the 90th percentile as "9 in 10 done within ..."), *Sprint velocity* (the average completed a sprint, and "N of M committed issues finished" summed over the sprints shown), *Open now* (the open count, split into in progress and to do). Each tile reads its own data through the same hooks as the charts, so there is no new request, and one failing request leaves the other tiles alone.
2. **Throughput is an area chart with a dot on every week** (the owner's pick from variant B), a dashed line for the average, and the best weeks carrying their number. Weekly counts have nothing between the weeks; the line only joins them, so the dots stay and a week with nothing finished is a dot on the baseline.
3. **Sprint velocity shows committed (quiet) next to completed (strong)**, with the share under each sprint name ("100%", or in the warning color when something was carried over). The committed count was already in the API (ADR 0011); the old chart showed only completed.
4. **"Where the work is" is two cards**: one segmented bar split by status with a legend (counts and percentages), and the open issues by label as a list. Both are plain rows with their numbers printed, so they have no "view as table"; the throughput, cycle time and velocity cards keep the link.
5. **The period is a row of four choices** (a `SegmentedControl` on native radio inputs, so the browser gives the arrow keys and the screen reader's "2 of 4") instead of a dropdown. The address (`?weeks=`) is still the single source of truth, and the default is taken out of the address. The velocity range stays a dropdown, because its choices depend on how many sprints exist (unchanged).
6. **Captions went.** The one-sentence summary under each chart is now the chart's `aria-label` (screen readers still get it). Cycle time and velocity keep one quiet line under the chart with the figures that no longer have a stat row (average, finished, latest sprint, carried over).
7. **Equal heights.** `ChartCard` fills its grid cell (`h-full`), so the throughput card and the "Where the work is" card end at the same line; the status card has blank space under its last line, which was chosen over stretching its content.
8. **Colors.** Two new semantic tokens for the committed bars and empty tracks (`--color-chart-quiet`) and the chosen segment of the period control (`--color-bg-segment-active`, `--color-text-on-segment-active`), redefined for dark mode like the rest.

## Amends ADR 0012

ADR 0012 rejected "Show label colors in the chart" and said the status colors were too light as graphics. Today: (a) the label list shows the label's own color **as the dot and as the bar** (the owner's call, after first seeing the bar in the chart color; the mockup had colored bars). The name and the count are always printed, so color never carries a label alone; a label with no known color falls back to the chart color. The cost is dark mode: the label colors are user-chosen and do not follow the dark palette. Measured against the dark card: bug 3.45, feature 3.23, docs 4.42, tech-debt 5.23, performance 4.53 are fine; design 2.76, security 2.93 and customer-request 2.20 are slightly under 3:1 (on the white card all eight are 3.19 or more). (b) The status colors are used for the segmented bar. Measured 2026-10-12 against the card (OKLCH converted to sRGB, WCAG contrast): light, done 3.67:1, in progress 7.58:1, to do 4.73:1; dark, 8.62, 6.88, 6.43, all at or above the 3:1 that graphics need. The segments are also separated by a gap and named with their counts in the legend.

## Limits, named

- `--color-chart-quiet` is below 3:1 against the card (1.48:1 light, 2.14:1 dark). It is used for the committed bars and the empty track behind a label bar, which are not the only carrier of their information: the number is printed on each committed bar, in the tooltip and in the table view. A darker quiet color would start to compete with the strong bar.
- The cycle-time card does not mark the median and the 90th percentile on the histogram (the mockup did). That needs the six bucket edges on the client, which today live only in the API (`CYCLE_BUCKETS`); a shared constant in `packages/contracts` would be the way, and was left out of this slice.
- The hover tooltip was checked with a real mouse on the throughput chart; the other charts' tooltips were not re-checked after the restyle (they are unchanged code).
- `/design-system` does not show `ChartCard` or `SegmentedControl` yet.
- Phone layouts were not designed (the mockups were desktop only). The grid stacks below the `lg` breakpoint; looked at once in the owner's browser at 420px: everything stacks, nothing scrolls sideways, the sprint names and the x labels stay readable. Not checked at tablet widths or on a real phone.

## Tests

`e2e/tests/analytics-page.spec.ts`: the tiles and the status card agree with a seeded project (one finished, one started, one waiting) and the table view still opens; the period choice lives in the address, survives a reload, and the default leaves the address. A mutation check (the per-week divisor) fails the first test. The numbers themselves stay tested at the API.
