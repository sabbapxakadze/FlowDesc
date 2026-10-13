# 0040 - A guided tour behind a Tutorial button

Status: Accepted - 2026-10-06.

## Context

The owner wanted a Tutorial button that teaches the app itself, to go with the demo organization (ADR 0039). The choices were a written Help page, a guided tour using a
library, or a guided tour written in our own code. The owner chose the tour in our own code.

## Decision

- **A "Tutorial" row in the sidebar footer** (above Design system) starts a tour of 16 steps (14 until ADR 0057, which added two on My work): a welcome, the project list, search (Ctrl K), My work, creating an issue (New issue, and the C key),
  the filters, the List / Board tabs, the board and dragging, opening an issue (comments and @mentions), Sprints, Analytics, notifications, the theme switch and a goodbye that points back at the button.
  Each step dims the page, highlights one part and shows a card beside it: "Step 3 of 14", a title, two sentences, Back, Next and Skip tour (Done on the last).
  Esc ends it, the arrow keys step, Tab stays inside the card, and focus goes back to the button when it ends.
- **A small engine, our own** (`shared/tour/`, domain-free): a store outside React (`startTour`, `closeTour`, `useTour` through `useSyncExternalStore`, so a button anywhere can start it and one `TourOverlay`
  mounted in `App.tsx` shows it), and an overlay that cuts a hole around the target with one fixed box and a large `box-shadow`, places the card on the side with room (falling back to another side, then clamped
  into the window) and re-measures on resize, scroll and when the target's size changes. About 250 lines, no dependency.
- **The content is separate** (`features/app-tour/tourSteps.ts`): each step names its part by a `data-tour="..."` attribute, which about twelve existing elements now carry (sidebar rows, the New issue button,
  the filter row, the view tabs, the board columns, a card, the bell, the theme switch, the Tutorial button). Search the code for `data-tour` to see the contract. A step may also name a page to go to first; the tour
  navigates for the person (the board, then back).
- **A step that cannot be shown is passed over, never stuck on.** The overlay waits for the target (up to 3 seconds after navigating to a page, 1.2 seconds on the page it is already on), and if it is not there
  (a phone, where the sidebar is a drawer that closes; a project with no issues) it moves on in the direction the person was going. The first step has no target, so a tour always starts.
- **It never changes data.** The page behind is blocked while a tour runs, and a test records every non-read request during a whole tour and expects none.
- Project steps use the person's first project. With no project they are left out.

## Trade-offs, named

- On a phone the tour is shorter and a little slower: the drawer closes when the tour changes page, so the sidebar steps after that are passed over (each after a short wait).
- Step texts are plain strings in the code; changing the product means changing them by hand, and there is no check that a text still matches the screen except the target existing.
- No automatic offer to new people ("Take the tour?"), no per-role tour, no record of who finished it. The button is the only way in.
- The highlight is a rectangle around the target's box; a target that is much larger than the window (a very long board) is highlighted as far as it shows.
- The card is positioned from measurements; unusual layouts could place it awkwardly, which is why Skip and Esc are always there.
- In development the query devtools button floats at the bottom right and can cover the card on a phone-sized window; production has no such button.

## Alternatives rejected

- A library (such as driver.js): less code and good positioning, but a new dependency and its look to bend to our design tokens; the owner preferred to write it.
- A Help page with screenshots: never breaks and costs little, but it is not interactive and screenshots go stale with every redesign.
- An "empty state" checklist ("create your first issue"): good for first-time users, but it does not show the parts of the app a person has not met yet.

## Amended 2026-10-09: the tour starts by itself on a first visit (ADR 0052)

The "no automatic offer to new people" limit above is lifted for one case: a person's first visit to the app. See ADR 0052.

## Amended 2026-10-10 (ADR 0057)

- Two steps follow "My work": "Your week" and "What needs you". They go to `/` by themselves (`path: "/"`) and point at `data-tour="my-week"` (the agenda) and
  `data-tour="my-needs-you"` (the overdue card). Like every step, they are skipped when their part is not on screen (nothing assigned), and the My work step's text
  describes the new page. One e2e test walks to them.

## Amended 2026-10-14 (ADR 0071)

- Two steps follow "Make it yours": "Use it from an AI app" (the sidebar's MCP pill, `data-tour="mcp-status"`) and "Access tokens" (`path: "/account"`, `data-tour="access-tokens"`). The tour is now longer than 20 steps, so the tests' limit is 30. One e2e test walks to them and checks both highlights.
