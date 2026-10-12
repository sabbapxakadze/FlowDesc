# 0065 - The sprints page: a strip of sprint cards, an active-sprint summary, done issues tucked away

Status: **Accepted, built** - 2026-10-12. The owner chose mockup A ("sprint strip") from several variants and asked for the guided tour to explain sprints carefully. Builds on ADR 0008 (sprint lifecycle), ADR 0011 (velocity as of the close) and ADR 0040 (the tour).

## Context

The page was a long list of sprint rows with Rename / Start / Complete / Delete buttons in every row, a create form always on screen, and a backlog that filled up with finished issues: completing a sprint sends **every** issue of the sprint (the done ones too) to the top of the backlog, in the same order (ADR 0008).

## Decisions

1. **A strip of sprint cards, oldest to newest**, above two lanes (Backlog and Active sprint). A card's look says its state: planned is dashed and has "Start sprint", active is outlined with its progress, completed is quiet and says how many of its issues were done when it closed (the numbers come from the velocity data, ADR 0011). The strip scrolls sideways and opens on the active sprint.
2. **The active lane opens with a summary**: name, status, dates and time left (in the warning color when the end date has passed: a sprint is never completed by a date), the split of its issues by status with the numbers printed, and the one action that ends it, "Complete sprint".
3. **Rename and Delete are in a "..." menu** (`shared/ui/ActionMenu`, a fixed-position `role="menu"`, closed by Esc, outside click, scroll, resize and Tab; arrow keys move). Delete is not offered for the active sprint (the API refuses it too). Choosing one swaps the card's body for the inline form.
4. **"New sprint" is a button and a popup**, not a form always on screen. Start and end dates are optional and **only set when the sprint is created** (Rename changes the name only). The popup says plainly that dates are for reference: a sprint never starts or ends on its own.
5. **Finished issues are hidden in the backlog by default**, behind a "Show done (N)" switch (`shared/ui/Switch`, a native checkbox with `role="switch"`) and a "Show N done issues" link under the cards. Only what is drawn is in the drag list, so a drop position is always measured against cards on screen; hidden issues keep their place.
6. **Start is disabled while another sprint is active** (a project has at most one: a partial unique index, ADR 0008), with the reason in the button's title. The empty active lane offers to start the oldest planned sprint.
7. **The guided tour explains sprints in five steps** instead of one: the idea, the strip, creating a sprint, the backlog, the active lane, and what Complete does. The text states only rules the code enforces (see the list in ADR 0008).
8. **The form reserves one line for each field's error** (`Field reserveErrorSpace`), so an error appearing never moves the popup; the e2e test pins it.

## Not built (named)

- No confirmation before Complete: it is one click, and the issues return to the top of the backlog, so it can be undone by hand but not by one action.
- No way to change a sprint's dates after creation.
- The strip shows at most what the velocity endpoint returns (the last 20 sprints) as "done of committed"; older completed cards show no count.
- Phone width was checked once in the owner's browser, not designed separately: the lanes stack and the strip scrolls.
- `/design-system` does not show `ActionMenu` or `Switch` yet.

## Consequences

- E2E specs that looked for per-row buttons now open the "<name> options" menu; the lane drop tests aim at the empty space near the bottom of the lane or the top of a card, because the lane now starts with the summary box.
