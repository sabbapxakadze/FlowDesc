# 0067 - The landing page's middle sections and its last one

Status: **Accepted, built** - 2026-10-12. The owner chose option C of three mockups (A bento, B editorial, C showcase) for "How it works", "What you get" and "What people use it for", then asked for a better "Built by" section and a copyright line. Builds on ADR 0043 (the landing page) and ADR 0066 (the name).

## Context

Every section after the hero was a heading over a grid of identical glass cards, and the page ended on two identical boxes (the call to action and "Built by"). Nothing on the page showed the app itself below the first screenshot.

## Decisions

1. **How it works**: three cards joined by arrows, each with a big faint numeral behind the text. The arrows are inside the cards (so the list is still exactly the three steps) and show from `md` up; below that the cards stack.
2. **What you get**: the same eight features, now three of them shown with the real screen they live on (Boards and sprints with the board, Find anything with the issue list, Analytics with the analytics page), in alternating rows with a short tick-list, and the other five as small tiles. The screenshots follow the page's theme (`ui/landing-shots.ts` is shared with the preview), are lazy-loaded, and have alt text that does not start with "The FlowDesc " (a browser test finds the preview picture by that start).
3. **What people use it for**: the four ways of working became a row of pills, one open at a time (`aria-pressed`, the same pattern as the preview's pills, cross-faded with `withViewTransition`). The pills are buttons inside a list, so the section keeps its four items. Each case has a small drawn example (`ui/UseCaseVisuals.tsx`) labelled "Example": they are decoration, hidden from assistive technology, and carry no real figures.
4. **Built by**: no longer a box. The maker's initials in a badge, the name in the serif face, and two contact cards (email, phone) on the page itself, then a thin rule and the last line, "© 2026 FlowDesc. All rights reserved." The heading text is unchanged ("Built by Saba Pkhakadze"; a test pins it).
5. **The copyright names FlowDesc, not a person, and the year is written, not computed**: 2026 is the year the page was first published, which is what the line means; a computed year would claim a new year of authorship every January.

## Not done (named)

- The screenshots are static images taken by `pnpm landing:shots`; they go out of date when the UI changes (already true of the preview).
- Only the "Run a sprint" example mirrors a real screen closely; the others are simplified drawings.
- No legal text beyond the copyright line (no terms or privacy page exists).
- Looked at in the owner's browser in dark and light at desktop width and at 420px: nothing scrolls sideways. Not checked in other browsers.
