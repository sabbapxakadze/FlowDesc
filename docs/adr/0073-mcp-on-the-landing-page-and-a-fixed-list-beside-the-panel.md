# 0073 - MCP on the landing page, a green MCP dot in the screenshots, and the side panel no longer narrows the Issues list

Status: **Accepted, built** - 2026-10-14. Builds on ADR 0043 and 0067 (the landing page), ADR 0071 (the MCP dot), ADR 0072 (the Issues list) and ADR 0025 (the side panel).

## Decisions

1. **MCP on the landing page, static and truthful.** A fifth way of working, **"Ask your AI"**, in "What people use it for": a drawn question and answer, captioned "Example", hidden from assistive technology like the other pictures. A new section, **"Use it from your AI app"** (`ConnectAi.tsx`), between "What people use it for" and the final call to action: three cards (make a token, add one command, ask), the real command with the placeholder `fd_pat_YOUR_TOKEN` and a Copy button, a note that it only reads and the token can be revoked, and a link to the package on npm. It says only what the package does today (read-only, started from the person's own computer, Claude Code and Claude Desktop). The landing page still makes no API calls (besides the demo's yes/no).
2. **The landing screenshots show the MCP dot green.** `pnpm landing:shots` now makes a read-only token named "landing screenshots" in the dev database's demo account, uses it once (a token counts as in use for 5 minutes after a request, ADR 0071), takes the six pictures, and **revokes the token again** (also if something fails). The pictures are static files, so nothing changes on the live site except what they show.
3. **The side panel no longer narrows the Issues list or its toolbar.** The 2026-10-07 rule (under 1560px an open panel added 31rem of right padding, so the list narrowed and, on the new one-line rows, fell into its phone layout) is removed for the Issues page: the list and toolbar keep their position and width and the floating panel overlays their right-hand end, at every window width. The List/Board tabs in the page header keep their clearance (shared with the Board, and the one control that would otherwise be unreachable), and My work keeps its own rule.

## Limits, named

- Under about 1560px the open panel covers the right-hand end of the list (due date, assignee, Edit) and of the toolbar. Close it with Esc, the X or a click outside; clicking another row's title (on the left) swaps the issue; the toolbar's controls are keyboard-reachable (the dropdown's list floats above the panel). This is the cost of "the table never shrinks" together with "the assignee is on the right edge".
- The command on the landing page is Claude Code's form; the Windows `npx` wrapper and other AI apps are not promised there (the package page has the details).
- The landing page's pictures go out of date when the UI changes (the usual limit of static screenshots); this round retook all six.

## Amended 2026-10-14 (ADR 0074)

The landing page no longer says the AI "only reads". The "Ask your AI" card and the "Use it from your AI app" section say a token is read only by default, can be made with write access to create, update and comment on issues one at a time, and can never delete anything. The command is unchanged.
