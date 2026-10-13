# 0072 - The Issues list is grouped by status, with a one-line toolbar and the assignee always on the right edge

Status: **Accepted, built** - 2026-10-14. Supersedes the row and column parts of ADR 0036 (the single surface and the container-query idea stay). Builds on ADR 0034 (List and Board tabs) and ADR 0035 (New issue).

## Context

The owner found the list "off" and compared three mock-ups drawn inside the real app (a cleaner table, grouped by status, and an inbox with a priority rail). Measured on the old list: rows were 61 px or 89 px tall (labels wrapped onto a third line or not), the key, status, priority and due date were 12 px grey next to a 16 px title, the photo circles were 20 px, a Done issue looked like an urgent one, "- Medium" read like "none", and six filter controls wrapped onto two lines. The owner chose **grouped by status**, with one requirement: **the assignee is always in the same right-most column**, with or without a due date.

## Decisions

1. **Groups: In progress, Todo, Done.** Done starts closed and is **not loaded until opened**. A status tab (`?status=`) shows that one status as a flat list without headers. Old addresses with `?status=` keep working: they select the tab.
2. **Three queries, one per status.** The API pages a project by one cursor, newest first, with a `status` filter and no totals. Three small `useIssues` calls (`useIssueSections`), sharing every other filter and the sort, need no API change, keep the keyset pagination and the live-update invalidation (`issueKeys.list(projectId)` is a prefix of all three), and let the Done query stay off. Each group has its own "Load more" ("Load more todo"). Rejected: loading everything and grouping in the browser (breaks at 20,000 issues); a `sort=status` on the server (a new index and cursor shape).
3. **One-line rows (40 px)**: priority icon (`PriorityMark`, with a name for screen readers), key, title with up to three labels, due date, an Edit pencil shown on hover or focus (always on touch), and the assignee. **Every cell has its own named grid column**, placed explicitly, so a missing due date or assignee leaves its cell empty instead of shifting the next one left. An unassigned issue shows a dashed circle in the assignee column. The assignee photo is 28 px (it was 20) and its person card opens leftwards.
4. **No Status column and no header strip**: the group (or the tab) says it. The container-query layout stays: narrow (a phone, or the list narrowed by the issue side panel) the title and the assignee share the first line, with the key, due date and Edit under the title.
5. **One-line toolbar**: New issue, status tabs, then quiet Priority / Due / Assignee / Labels and the sort. The shared `Dropdown` gets a `quiet` look: no box until pointed at, as wide as what it shows (it no longer reserves room for its widest option), and with an `emptyLabel` it reads "Priority" while nothing is chosen and **"Priority: High" in the link colour** once something is. The accessible names ("Filter by priority", "Sort") are unchanged.
6. **Numbers**: tab and group counts are the project's exact totals, from the existing summary (`todo = open - inProgress`, because `open` means "not done": checked against the SQL), **only while no other filter is on**. With a filter on, a group's number is what has been loaded (with a "+" while there is another page) and the tabs show none. The summary is re-read whenever a group is refreshed.
7. **The edit popup follows the issue, not the group.** The first version looked the issue up in the lists, so when someone else moved the issue being edited into a group that is not loaded (Done, closed), the popup closed under the person (found by the existing "someone changed this issue" test). It now reads the issue by its number (`useIssueByNumber`, which live updates already refresh), seeded from the row so it opens with what the person sees.
8. Hidden empty groups: an open group with nothing in it is left out (the Todo group disappears when its last issue starts); Done keeps its collapsed header so finished work can always be reached.

## Limits, named

- A group's number under a filter is "loaded so far", not a total (the API has no counts).
- Three requests (two while Done is closed) instead of one on a first visit. Not measured at 20,000 issues in the browser; each query is the same one as before, per status.
- Whether a group is open is not remembered between visits (Done starts closed each time).
- A "Medium" priority still shows the dash icon, as on the board cards; only urgent and high are coloured.
- The landing page's Issues screenshot shows this list and was retaken separately (ADR 0043).

## Amended 2026-10-14 (ADR 0073)

The side panel overlays the list instead of narrowing it, so the stacked layout is only for a narrow window or a phone, not for "panel open". Under about 1560px the panel covers the due date, assignee and Edit columns while it is open.
