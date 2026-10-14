# 0071 - MCP in the app: a status dot, a "?" help, tutorial steps, and a Log out button

Status: **Accepted, built** - 2026-10-14. Builds on ADR 0070 (the MCP server and access tokens), ADR 0040 (the tour) and ADR 0044 (the demo).

## Context

`flowdesc-mcp` is published and works, but nothing in the app said it existed except the Access tokens section on the Account page. The owner asked for the MCP to be explained in the Tutorial, for a small "?" beside Access tokens saying what to do, for an "MCP" indicator beside the theme switch (green dot when connected, grey when not), and for "Log out" to be a button instead of underlined text.

## Decisions

1. **The dot means "in use", not "connected".** The MCP server is a local program that makes ordinary HTTP requests with a token; FlowDesc holds no open connection to it, so it cannot know that an AI app is merely open. The dot is green when a token that still works (not revoked, not expired) was used in the last **5 minutes**, grey otherwise. The server already records `last_used_at` (at most once a minute, ADR 0070), so there is **no new endpoint and no schema change**: the sidebar reads the existing `GET /users/me/api-tokens`. The rule is one pure function (`entities/api-token/lib/mcpStatus.ts`) with unit tests that pin the window in both directions.
2. **It is a security cue as much as a convenience.** A green dot while you are not using your AI means something is reading your data with your token, and the pill links to `/account#access-tokens`, where a token is revoked. It shows nothing a token owner could not already read on that page.
3. **Polling, not push.** The sidebar's query refetches every 30 seconds (TanStack Query pauses an interval in a hidden tab), and the pill re-reads the clock on its own every 30 seconds so the dot goes grey when the last request slides out of the window even if the list is unchanged. A push over the existing `user:{id}` socket room was considered and left out: more code for a cue that is fine a minute late.
4. **The state is never colour alone.** The pill carries the sentence in `aria-label` and `title` ("MCP: in use (an access token was used 2 minutes ago)", "MCP: no recent activity...", "MCP: no access token yet. Open Account to set one up."), and a `data-mcp-state` attribute for tests. While loading it says "checking" and is grey.
5. **Hidden in a demo copy** (`organization.demoExpiresAt` set): the server refuses tokens there (ADR 0044), so the pill and its polling are off, and the Access tokens section shows a note.
6. **The "?" help** (`features/manage-api-tokens/ui/McpHelp.tsx`) sits beside the section title and opens the shared `Dialog` with the steps in order: create a token, have Node.js 22 or newer, add the server to the AI app (a Claude Code command and a Claude Desktop JSON block, each with a Copy button), ask something, revoke. It uses the placeholder `fd_pat_YOUR_TOKEN`: **a real secret is never put into a command that can be copied from the page** (tested). It links to the npm package page for other apps and Windows details; the Claude Code `--env` repetition and a Windows `npx` wrapper are unverified, so the dialog says less rather than claim them.
7. **Tutorial**: two steps after "Make it yours" in `tourSteps.ts`: "Use it from an AI app" (the pill, `data-tour="mcp-status"`) and "Access tokens" (goes to `/account`, highlights `data-tour="access-tokens"`). The existing rule that a step whose part is not on screen is skipped is unchanged. The tour tests' step limit rose from 20 to 30, and `advanceTo` from 16 to 30.
8. **Log out is a button**: a bordered button with a `LogOut` icon, built from the sidebar tokens, still a `<button>` named "Log out" (so every spec that clicks it is unchanged), in the same row as the name.

## Limits, named

- A green dot can trail real use by up to about a minute (`last_used_at` is written once a minute), and an AI app that is open but quiet shows grey.
- A token used by something that is not an AI app (a script with curl) also turns the dot green; the text says "an access token was used", not "an AI app".
- The 30-second poll's real cost was not measured (one small request per open, visible tab).
- Tests: found while writing them, a "the pill is grey" check passed on the loading state alone (the pill is also grey while loading); the specs now wait for the real label first, and a mutation (green whenever any usable token exists) is caught.
- A pre-existing, unrelated console warning ("<p> cannot contain a nested <p>") comes from the Sprints page, not from this slice; left for the owner to decide.

## Amended 2026-10-14 (ADR 0073)

The landing page's screenshots are taken with a freshly used token, so the MCP dot is green in them.

## Amended 2026-10-14 (ADR 0074)

The Access tokens form now offers **Read only** (default) and **Read and write**, the help dialog and the first tutorial step no longer say a token can only read, and the token list says which scope each token has. The pill is unchanged (it only looks at use, not at scope).
