# 0025 — Opening an issue in a side panel

Status: Accepted — 2026-10-03.

## Context

Clicking an issue always navigated to its own page, so looking through a few issues of a
board or a list meant leaving it and coming back. The owner wanted Notion's peek: the issue
opens beside the page, with a way to open the full page. Several shapes were mocked
(slide-over, split view, centered popup, bottom sheet, floating card, popover, list and detail)
and the owner chose a **floating card**: stacked content (as the full page), under a tinted
header strip with the issue key, "Open full page" and a close button.

## Decision

- **The issue is in the URL as `?issue=<id>`** on whatever page is showing the list, board or
  sprints. Back closes the panel, a reload keeps it, the link can be shared, and the page's own
  parameters (filters, sort) are kept. Opening adds one history entry; swapping to another issue
  replaces it, so one Back returns to the page. `open()` and `close()` build the new query from
  the live address bar, not from the render's copy (see Consequences).
- **One view, two frames.** The body of the issue page moved into `widgets/issue-detail`. The page
  and the panel render the same component (`variant="page" | "panel"`); only the header and the
  frame differ (page: serif title, back link, `<main>`; panel: the strip, a compact title, a
  scrolling body, section headings one level lower). Live updates, presence, comments, files,
  editing, deleting and the hover cards therefore work in the panel with no extra code.
- **`shared/ui/SidePanel`** is a domain-free shell: a non-modal dialog (no dimming, nothing
  made inert) floating at the right with a margin (480 px wide), a full-screen sheet on a phone.
  It closes on Esc and on a click outside; it moves focus in and returns it to the opener.
- **Outside rules** (the owner's: another card swaps, anywhere else closes): a click outside closes
  it unless it landed on a card marked `data-panel-trigger` (that card swaps the panel) or inside an
  open `<dialog>` (the command palette, an image preview). The click is not swallowed, so a page
  button still acts. Esc is ignored while a `<dialog>` is open, so an image preview gets its own
  Esc first.
- **Cards stay real links.** `IssueCard`, `BoardCard` and `SprintIssueCard` take an optional
  `onOpen`; a plain left click calls it, while Ctrl, Cmd, Shift, Alt or a middle click keep the
  normal link (the full page in a new tab). The drag-click guard still cancels the click that ends
  a drag, so dropping a card never opens the panel. Search results, the command palette and
  notifications pass no `onOpen` and keep opening the full page.
- A deleted issue (by this person or another) closes the panel and leaves the usual notice on the
  page behind.

## Consequences

- **A race found by the tests:** closing on `pointerdown` made the panel's URL update and a page
  button's own URL update (a filter) race, each computed from a stale copy, so the button re-added
  `?issue=`. Fixed by closing on `click` (after the button's handler) and reading the live URL.
  Any other control that rewrites the query from a stale copy while the panel is open could still
  fight it; the existing pages do not.
- "Inside" is decided from the event's original path, because a clicked button may already have
  removed itself from the page (a Cancel) by the time the document listener runs.
- The panel is not a modal: keyboard focus is not trapped. It is reachable and closable by
  keyboard (Tab, Esc); the page behind stays reachable by Tab too.
- A draft comment typed in the panel is lost when it closes (the component unmounts). Not
  implemented: keeping drafts. Named, not fixed.
- On a narrow laptop the floating card covers the right part of the board; the board scrolls.

## Alternatives rejected

- **Slide-over with a dim (like Notion), split view, bottom sheet, popover, list and detail:** all
  mocked; the owner preferred the floating card (lighter, no dimming, the page stays usable).
- **Tabs inside the card** (Details, Comments, Files): hides comments behind a click, which
  defeats a quick look.
- **A route per panel (`/issues/:id` rendered over the list):** a nested layout route would work
  but ties the panel to one page's layout; the query parameter works on any page.

## Amendment (2026-10-03)

- A click on a link outside the panel (a sidebar link) must navigate. Closing on `click` ran after
  the link's own navigation and, resolving its address from a stale path, sent the page back. The
  panel now ignores a click a link already handled (`defaultPrevented`), and `open()`/`close()`
  build their address from the live path and query. Found by an e2e test.
- The sidebar wrapper got `z-30` so the notifications dropdown is not painted under later
  positioned page content (the charts); the panel stays above it at `z-40`.
- The panel body uses the page background so the cards inside (attachments, comments) stand out in
  dark mode, as on the full page.

## Amendment 2026-10-05: editing is a popup

Edit no longer turns the list row or the issue page into a form. It opens a modal dialog (`shared/ui/Dialog`, a native
`<dialog>`) from the list, the issue page and this panel. A modal dialog is in the top layer, so it appears above the panel;
the panel stays open behind it and keeps leaving Esc and clicks to an open dialog, as it already did for the search and the
image preview. Esc closes only the dialog.

## Amended 2026-10-10: a press that began inside is not a click outside

Dragging a text selection out of the panel (for example out of the comment box) and letting go over the page closed the panel, because the browser reports that click on a shared parent of the two spots, which is outside the panel. `SidePanel` now remembers where the current press began (capture-phase `pointerdown`, forgotten right after `pointerup`) and ignores the click when it began inside. A press and release both outside still close it. Found by the owner while writing a comment; covered by a browser test that drags out of the comment box. Checked and found NOT affected: the New issue dialog (a drag from its title box onto the backdrop leaves it open), the notification bell and dropdowns (they close on the press, not the click). Not checked: the command palette, which uses the same backdrop test as the dialog.

## Amended 2026-10-10 (ADR 0057)

- My work opens issues in the panel too (tiles, the overdue card, "Recently updated"). The page spans projects, so `MyWorkIssuePanel` finds the project from the key in `?issue=`.
  Notifications still open the full page, as above.

## Amended 2026-10-14 (ADR 0073)

The Issues page no longer makes room for the open panel: its list and toolbar keep their width and the panel overlays their right-hand end, at every window width (it was: under 1560px they narrowed by the panel's width). The List/Board tabs and My work keep their clearance.
