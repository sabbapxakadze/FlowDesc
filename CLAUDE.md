# FlowDesc — Project Instructions

> Read this file fully before doing anything. It is the contract for how this
> project is built. If a request conflicts with it, say so before proceeding.

## What this is

FlowDesc is a collaborative project-management platform for small engineering
teams (organizations → projects → issues → comments/labels/assignees → sprints).

It is built as a **real SaaS product**, not a CRUD demo, and it is above all a
**learning project**. The owner must be able to explain every architectural
decision and every non-trivial line in a technical interview. Optimising for
speed of delivery at the cost of the owner's understanding is a failure, not a
win.

## Current phase

**Phase 8 — Analytics** is complete (5 slices, see
`docs/roadmap.md`). Phase 7 (Search, notifications, uploads) and Phase 6
(Real-time) are fully complete.

Phase 8 slice 1 (foundations + throughput) is done: ADR 0009 decides
analytics are computed on read from `issue_events`, with transitions found
by replaying each issue's events in order (an `issue.updated` can carry an
unchanged `status`, so the payload alone can't be trusted). New `analytics`
module and `GET .../analytics/throughput`; Recharts on new semantic
`--color-chart-*` tokens; `/projects/:id/analytics`. The trap tests were
proven to fail when the previous-status check is removed, and an
independent JS replay matched the SQL for all 12 seeded weeks. Not yet
verified: tooltip on a real mouse hover (verified via keyboard only).
Phase 8 slice 2 (cycle time) is done: ADR 0010 defines it as first
entry into in_progress to the first completion after it, with
never-started issues reported as `withoutStart` instead of hidden;
median leads, plus mean, p90 and six buckets. The replay CTE is now
shared with throughput. Mutation checks confirmed the tests catch a
MAX-instead-of-MIN start and a missing at-or-after-start guard, and an
independent JS replay matched the SQL exactly.
Phase 8 slice 3 (sprint velocity) is done: the open question (where past
sprint membership comes from, since `complete()` clears `issues.sprint_id`)
turned out to be already answered by `complete()`'s own
`sprint_completed` release events, which snapshot membership at close, so
there is no schema change (ADR 0011). "Done" is judged as of the close,
not today. The tests use the real sprint/issue repositories, and mutation
checks exposed and fixed a too-weak test before it shipped.

Phase 8 slice 4 (breakdowns) is done: ADR 0012 draws the line that history
(throughput, cycle time, velocity) comes from issue_events while the
present (issues per status, open issues per label) comes straight from the
tables. Label counts are not additive (an issue with two labels counts under
both) and the UI and ADR say so; unlabeled and hidden-label counts are shown
instead of dropped. Mutation checks again exposed two test gaps (unlabeled
isolation, and the label-organization guard needing a hand-inserted bad
row) which were fixed before shipping.

Phase 8 slice 5 (dashboard assembly, range in the URL, performance at
volume) is done, so **Phase 8 is complete**. `?weeks=` and `?sprints=` drive
the ranges (defaults out of the URL, bad values fall back). Measured at
20,000 issues: velocity was 3.9 s because Postgres materialized a CTE that a
correlated subquery rescanned per row; `NOT MATERIALIZED` plus dropping an
unused CTE brought it to ~19 ms, and merging cycle time's two replays into
one halved it to ~75 ms. No index or schema change. Chart tooltips are
anchored to the hovered column/row (checked with a real mouse), and the
sprint selector hides choices that would change nothing. Narrow (~420px)
x-axis labels wrap onto two lines instead of overlapping.

**Phase 8.5 (Collaboration polish) slice 1 is done**: comments can be edited and
deleted and can carry files, and the timeline shows times (ADR 0019). History
stays append-only (new `issue.comment_edited`/`issue.comment_deleted` events,
folded by the API into the comment; the original text of a deleted comment stays
in the stored event, hidden not erased). Author edits, author or owner/admin
deletes, neither notifies, a deleted comment's files stay as plain attachments.
Phase 8.5 slice 2A (issue priority) is done too: a `priority` enum on issues
(default `none`), set via the version-checked PATCH, filterable with `?priority=`,
shown on cards and in the activity. Slice 2B (assignee) is done too (ADR 0021): a
nullable `assignee_id`, checked against organization membership in the service,
a new `GET .../members`, and notification recipients are now past participants
plus the current assignee.
The e2e suite (ADR 0020, `pnpm test:e2e`) found and we fixed a real auth bug: two
simultaneous `/auth/refresh` calls on page load (StrictMode) made the server's
token-reuse detection revoke the session, so the next load logged the user out;
`AuthContext` now shares one in-flight refresh.
Slice 3A (rename) is done too (ADR 0022): project name (the key is immutable),
label name and colour, and sprint name, with a project settings page, a Labels page
and inline sprint rename. Slice 3B (delete issue, label, sprint) is done too: hard delete, issue by the
reporter or an owner/admin, files removed from disk, live redirect for viewers, inline
confirmation. Slice 3C (delete project) is done: the exact name is required by the UI and by the
API, everything cascades, files are removed, the organization is told live. Measuring
it at 20,000 issues found a missing index (`notifications.issue_event_id`, 8.5 s of a
9.0 s delete); migration 0018 fixed it (0.6 s). **Phase 8.5 slice 3 is complete.**
A polish slice followed (2026-10-01): a notice after a deletion redirect, renames and
deletes reaching other open tabs live (`org:changed`), no retry of 4xx answers (a bad
link says "not found" in under a second), and the previous assignee being notified
(ADR 0021 amended). Save buttons are now green and Delete is red (a red first click, a
stronger red on the final confirm), through new semantic action tokens and Button variants,
with deeper hover/pressed states (plus a light ring in dark mode). Comments are now cards with a
tinted header strip (avatar, name, time, "(edited)") and hover-revealed Edit/Delete icons, chosen
by the owner in a three-option design pass. Image attachments open in a preview popup (zoom,
Download; expired signed links are refetched).
Attachment previews followed (2026-10-02): comment cards with a header strip, an image/video
preview popup with zoom or player controls and Download, and thumbnails in comments. Video
(mp4/webm, 10 MB) needed range requests on the download route so seeking works (ADR 0023).
Issue activity lines are icon rows colored by event kind, and a person's name opens a hover card
(role, email) wherever it is shown in a sentence or header (`shared/ui/PersonHover`, `entities/member/PersonName`).
Buttons are standardised (Button cleanup, 2026-10-02): `Button` has a `link` variant, there is an `IconButton`,
and lint fails on hand-written link styles and unlisted raw `<button>`s.
Collaborators slice A is done (ADR 0024): owners and admins invite people without an account by email with a
role, through a one-time link; a Members page lists people and pending invitations. Slice B adds role changes, removal
(membership only; their issues are unassigned; they can be invited back) and re-sending an invitation.
Issues open in a floating side panel (`?issue=<id>`, ADR 0025) from the list, board and sprints pages; the
issue page body is the shared `widgets/issue-detail` used by both the page and the panel.
The project issue list can be sorted by priority (`?sort=priority`, ADR 0026), paged by a keyset cursor with its own index.
The organization audit log (ADR 0027) records 16 actions (deletes, renames, membership) with name snapshots, in the
same transaction as the action; owners and admins read it at `/audit-log`.
Profiles (ADR 0028) add a job title, bio and photo: `/profile` to edit, `/people/:userId` to view, a "View profile"
link on the hover card; photos are re-made on upload (256x256 WebP) and served from a public random-key URL. A dismissible
"Finish your profile" card on Projects invites people with a bare profile (dismissal stored on the account).
The sprints-page backlog and active sprint are drag-sortable (`backlog_rank`, ADR 0008 amended), and the board and sprints
page scroll inside tinted lanes (`shared/ui/Lane`, `shared/dnd/multiList`).
Addresses are readable (ADR 0030, 0058): `/projects/WEB`, `/projects/WEB/issues/WEB-12`, `?issue=WEB-12`, `/people/daniel-okafor-b50fc811` (name for reading, the first 8 characters of the id for finding); ids still resolve and are
rewritten; ids remain the identity inside the app and the API.
The app has a motion language (ADR 0029): page fade-and-rise, panel slide, dialog fade-and-grow, rows that open and close,
button press/spinner/tick, theme cross-fade; all off under reduced motion, and the e2e suite runs with reduced motion on.
`/account` is the private account page (email through a confirmation link to the new address, password with the other devices signed out,
timezone; ADR 0031).
Issues have an optional due date (a calendar day, ADR 0032): a chip with an "Overdue" marker on cards, My work and the issue page, set in the edit popup, and an
Overdue / No due date filter on the Issues page.
Comments support @mentions (ADR 0033): type `@` and pick a member; the mentioned person is notified (also by an edit that adds them) and shown as a profile link.
Board and sprint cards show label pills; the Account page has a "Sign out of all devices" button.
The full issue page has a properties card under the title and a centered 768px column (ADR 0061); the side panel keeps its compact layout.
The Members page lists people grouped by role (Owner and admins, Members, Viewers; ADR 0060) with the invitation list in the same style.
A project's Issues and Board pages share List / Board tabs in their headers (ADR 0034; one "Issues" sidebar link); merging them into one page is step 2.
Issues are created with a "New issue" button and popup on both pages (the C key too; ADR 0035); the inline form is gone.
The Projects page (ADR 0059) is a grid of cards with their numbers (done bar, open / in progress / overdue, the running sprint) from one read, `GET .../projects/summary`; "New project" is a popup for owners and admins.
The Issues list is one surface of two-line rows under a column header (ADR 0036), stacking by its own width (also beside the side panel); board and sprint cards stay cards.
The board and sprint cards (and the drag preview) have a colored priority edge, the assignee at the top right and a labels/priority footer (ADR 0037); dragging is unchanged.
The access token is renewed silently (on a rejected request, and on returning to a tab) and an inactive person is warned and then signed out after 30 minutes (ADR 0038); nobody should see "Invalid or expired access token".
A demo organization with five people and about 76 issues of realistic data is built by `pnpm db:seed:demo` (log in as `demo@flowdesc.test`, password `Demo123!@#`; `--reset` rebuilds it; ADR 0039).
A "Tutorial" row in the sidebar starts a guided tour of the app (our own small engine in `shared/tour`, steps in `features/app-tour`, parts named by `data-tour` attributes; ADR 0040).
The tour also starts by itself on a person's first visit to the app (ADR 0052: `users.tour_seen_at`, `FirstTour` in `AppShell`; existing accounts were marked seen by the migration; e2e fixtures mark their own users). Logging out and returning from Google or GitHub cross-fade (ADR 0029 amended).
The public auth pages are a frosted-glass card over soft blurred shapes with a Log in / Create account switch, and every password field has a show/hide button (`shared/ui/PasswordInput`; ADR 0041). Sign-in with Google and GitHub (ADR 0042) is built and optional: a provider's button shows only when its credentials are in `apps/api/.env`; such accounts have no password until they add one on `/account`, where Sign-in methods connects and disconnects providers (never the last way in).
A public landing page (ADR 0043) is what a logged-out visit to `/` shows (what the app is, a preview of the real app, how it works, the owner's contact details); logging out or an expired session still goes to `/login`; its screenshots are retaken with `pnpm landing:shots`.
"Try the demo" on the landing page (ADR 0044, off unless `DEMO_ENABLED=true`) gives each visitor a private, passwordless copy of the demo organization that is refused and deleted after `DEMO_TTL_MINUTES` (default 120), starts the guided tour, and shows a demo bar; the server caps live copies (`DEMO_MAX_ACTIVE`), rate limits starts, and refuses invitations, email or password changes, OAuth connect, uploads and more than 300 issues for a demo (`modules/demo/demo.guard.ts`: new features that send email, store files or change an account must call it too).
`/` is the "My work" page (ADR 0057: a greeting and week ring, the week as an agenda with overdue issues on their own days, an overdue card, unread notifications; it does not scroll the page on a wide screen, and issues open in the side panel). The issue list carries each issue's labels and
filters by several labels at once (an issue must have all of them).
The assignee circle on an issue card shows the person's photo and is a profile link with the hover card (beside the card's issue link, never inside it).
Every dropdown is the app's own `shared/ui/Dropdown` (search past seven options, marks before labels, keyboard and screen-reader support), not a native select.
Long lists scroll inside their own area instead of stretching the page (`shared/ui/ScrollPanel`: a raised panel on the Issues
page, edge shadows on a person's activity and an issue's timeline).
Production mode (ADR 0046, Phase 9 slice 9.1): with `SERVE_WEB=true` the API process serves the built web app (`apps/web/build`, from `pnpm build`) on one address, `TRUST_PROXY=3` behind Render's proxy chain (measured, ADR 0051; not 1), `RUN_MIGRATIONS=true` brings the schema up to date at start, SIGTERM stops it cleanly, and a strict Content-Security-Policy (scripts by hash, no eval) is sent; the plan for hosting on Render + Neon + R2 is the top of Phase 9 in `docs/roadmap.md` (ADR 0045).
A refresh token that was spent less than 10 seconds ago, in a family that is still alive, is answered again instead of revoking the family (ADR 0048; found by the first CI run: a cancelled refresh logged the person out). CI is `.github/workflows/ci.yml` (ADR 0047): four jobs, the browser suite in 4 shards each with its own Postgres.
The app is LIVE (2026-10-08, ADR 0049): https://flowdesc.app (custom domain bought on Cloudflare 2026-10-12, DNS only; ADR 0066; the Render address flowdesk-yotg.onrender.com still works) on Render free + Neon free, created by hand in the dashboard (`render.yaml` records the settings), emails work since 2026-10-12 (ADR 0066: the domain flowdesc.app is verified in Resend, `EMAIL_FROM=support@flowdesc.app`, and Cloudflare Email Routing forwards support@flowdesc.app to the owner's inbox; the owner checked a password-reset email end to end). The first deploy settings (ADR 0049): `render.yaml` (one free Render web service, Frankfurt), `APP_URL` falls back to Render's `RENDER_EXTERNAL_URL`, `STORAGE_DRIVER=disabled` refuses uploads until real storage (9.5), and the database pool is capped and logs a dropped idle connection instead of crashing.
Files can live in an S3-compatible bucket (ADR 0053, `STORAGE_DRIVER=s3` plus five `S3_*` values; Neon Object Storage; a disk store stays for development and tests; on in production since 2026-10-09; the owner checked photo, attachment, video seeking and a redeploy).
The live site is watched (ADR 0055): a read-only smoke tool (`node apps/api/src/tools/smoke-live.ts <address>`), a daily uptime workflow using it, a weekly encrypted database backup workflow (`docs/backups.md`), and optional server-side Sentry (`SENTRY_DSN`); a README now exists.
Comments are formatted (ADR 0056): the body is a small subset of Markdown in the same field, drawn by the shared reader `parseCommentMarkdown`, and written with a TipTap editor (`shared/ui/RichTextEditor`, loaded on demand; toolbar and shortcuts, link Ctrl+Shift+K) in the comment box and in editing a comment; issue descriptions still use the plain text box. Built 2026-10-10 and left to CI for the final full run.
A first security pass is written up in `docs/security.md` (ADR 0054): development-tool vulnerabilities pinned by pnpm overrides, a password-reset timing leak fixed, secrets rotation notes, and a checklist of dashboard settings for the owner.
Personal access tokens (ADR 0070, slice 1 of an MCP server for AI clients, 2026-10-13): a person can create a long random read-only token (`fd_pat_...`, only its hash stored, revocable, 30/90/365 days) through `/users/me/api-tokens` (and, since slice 2, an "Access tokens" section on the Account page: create, copy once, revoke); `requireAuth` accepts it, but only for the GET addresses on the single default-deny list in `middleware/token-access.ts`. A new route is closed to tokens until it is added there.
The landing page also covers MCP (ADR 0073, 2026-10-14): a fifth "Ask your AI" way of working and a "Use it from your AI app" section with a copyable placeholder command; `pnpm landing:shots` makes, uses and revokes a read-only token so the sidebar's MCP dot is green in the pictures; and an open issue panel overlays the Issues list instead of narrowing it.
The Issues list is grouped by status (ADR 0072, 2026-10-14): In progress, Todo and Done (closed, loaded only when opened), one query per status (`useIssueSections`), a one-line toolbar with status tabs (`?status=`) and quiet filters (`Dropdown quiet`), one-line rows with the assignee always in the last column (every cell is placed in its own named grid column), exact counts from the project summary while no other filter is on, and the edit popup following the issue by number.
MCP in the app (ADR 0071, 2026-10-14): an "MCP" pill beside the sidebar's theme switch (`features/mcp-status`, green when an access token was used in the last 5 minutes, grey otherwise, hidden in a demo; the rule is `entities/api-token/lib/mcpStatus.ts`), a "?" help dialog beside Access tokens (`features/manage-api-tokens/ui/McpHelp.tsx`, placeholders only, never a real token), two Tutorial steps, and "Log out" is a bordered button.
The MCP server (`apps/mcp`, package `flowdesc-mcp`, MIT, ADR 0070 slices 3 and 3b, built 2026-10-13, published on npm (`npx -y flowdesc-mcp`, 0.1.1 from the workflow with provenance) from `.github/workflows/publish-mcp.yml` on a pushed tag `mcp-vX.Y.Z` (the number must equal `apps/mcp/package.json`'s version), by npm trusted publishing with no stored token; `pnpm --filter flowdesc-mcp bundle` makes the single published file): a local stdio program an AI app starts with `FLOWDESC_TOKEN`; nine read-only tools (`whoami`, `list_projects`, `list_issues`, `get_issue`, `search_issues`, `get_sprints`, `get_backlog`, `get_analytics`, `get_my_work`) that call the REST API; `src/client.ts` is its only network code; stdout is the protocol, so log to stderr only. Its API test lives in `apps/api` (`mcp.http.test.ts`) and uses `flowdesc-mcp/testing`; the API test CI job builds the package first.
Logs never carry credentials (ADR 0050): the Authorization header, the Cookie header and Set-Cookie are redacted by the logger itself; found after the first deploy, because Render keeps and shows the logs.
Remaining Phase 8.5 slices are in `docs/roadmap.md`.

Slice 4 (file attachments) is done: local disk plus our own HMAC-signed,
time-limited download tokens, chosen with the owner because S3 and
Docker are explicitly Phase 9 in the stack list. New `lib/storage.ts`
is the seam real S3 would swap in behind; new `attachments` table inside
the `issues` module (a sub-resource like labels/comments); `multer`
(memory storage) with rejections translated to `AppError`s; allowed
types and the 10MB cap shared through `packages/contracts`. The download
route is deliberately unauthenticated and token-gated — the signature is
the authorization. Uploads/deletes go through the existing
`writeIssueEvent`, so participants are notified with no new wiring.
Named limits: MIME type is client-supplied, not byte-sniffed; no live
sync of the attachment list; no inline previews. **A real slice 3 bug
surfaced here, found only by reloading the page**: `connectSocket()`
replaced the socket on every call and React StrictMode runs the auth
refresh twice on reload, so the always-mounted notification bell's
listener sat on a dead instance and live pushes silently stopped (slice
3's live test logged in via the form, which only calls it once). Fixed
by making `connectSocket()` idempotent for an active same-org
connection; re-verified on the failing path. Live verification used a
`DataTransfer`-set file, not a native file chooser (Chrome refused the
injected chooser) — recorded honestly in the roadmap.

Slice 3 (notifications derived from events; in-app feed + read state)
is done: no assignee field exists on issues, so recipients are
**event participants** — every distinct actor from an issue's past
`issue_events` rows, minus whoever just caused the new one (confirmed
with the owner before building). A new `notifications` table (no
`organizationId` column, joined through `issue_events` → `issues` for
tenant scoping, same pattern `issue_events` itself already uses) and a
new `notifications` module — unlike search, this earned its own module
(its own table, its own mutation, its own recipient). A new
`writeIssueEvent()` helper in `issues.repository.ts` replaces all 7
previously-duplicated event-insert call sites and fans out one
notification per participant in the same transaction; also reused by
`sprints.repository.ts`'s `completeSprint()` for its bulk
`issue.sprint_removed` writes — no carve-out for that path. Live
delivery rides a new `user:{userId}` Socket.IO room, auto-joined on
connect (not a client-emitted `join:*` — your own notifications are
always wanted). New `entities/notification` + `widgets/notification-bell`
(a fixed-position bell, non-modal dropdown, read-on-click-through plus
"Mark all read"); `describeEvent` moved out of `IssueDetailPage.tsx`
into `entities/issue/lib/` as a second real consumer. **A real bug
found and fixed live, the same class as slice 2's**: `useNotifications`/
`useUnreadCount` fired with an empty `organizationId` while logged out
(the bell is mounted globally) — caught via the browser console, fixed
with an `enabled` guard on both. Verified live end to end with a real
second org member driven via authenticated HTTP requests: a comment
updated the first user's badge and panel live with no reload, from
more than one page; click-through and "Mark all read" both worked; no
self-notification; and an API kill/restart confirmed the socket
reconnected, rejoined `user:{id}`, and a subsequent comment still
delivered live afterward.

Slice 1 (Postgres full-text search backend + results page) is done: a
new generated `search_vector` column on `issues`
(`GENERATED ALWAYS AS (...) STORED`, built through Drizzle's
`customType()` since pg-core has no first-class `tsvector` type) plus a
GIN index, a new org-scoped `search()` repository function using raw
`sql` for `websearch_to_tsquery`/`ts_rank` (Drizzle has no first-class
full-text operator), a new `GET
/organizations/:organizationId/search?q=` endpoint, and a new
`SearchPage` at `/search` with `?q=` as the URL's source of truth.
**Unlike `board_rank` (ADR 0007), this needed no hand-written
migration** — a generated column self-populates every existing row the
instant it's added, no `NOT NULL` backfill problem to work around;
verified by reading the actual generated migration SQL and by direct
`psql` inspection of real rows' weighting and stemming, not just
assumed. Verified live end to end: a title match ranked above a
description-only match for the same term in the real UI, a second,
genuinely different organization never saw the first org's matching
issue, a bookmarked `?q=...` URL reproduced the same results on a fresh
page load with zero prior interaction, and `EXPLAIN ANALYZE` against
20,000 real seeded rows confirmed a `Bitmap Index Scan` on the new GIN
index, not a sequential scan.

Slice 2 (command palette, Ctrl+K/Cmd+K) is done: the first real widget
in the codebase (`widgets/command-palette/`, empty since Phase 0),
mounted once in `App.tsx` and rendering nothing while logged out. No
backend changes — reuses slice 1's search endpoint via the existing
`useSearch` hook, with a colocated `useDebouncedValue` (250ms) in
front of it. Uses the native `<dialog>` element rather than adding a
dialog library — Phase 3.5 deliberately skipped Radix, and one modal
doesn't justify it now. **A real bug found and fixed live**: the
palette's `useProjects()` call (needed to resolve each result's
`projectKey`) fired with an empty `organizationId` while logged out,
since `useProjects` had no `enabled` guard — none of its five other
callers needed one, they all render inside `RequireAuth`. This sent a
real request to `/organizations//projects` on a repeating background-
refetch loop, 404-ing every few seconds, caught via the browser
console rather than assumed safe. Fixed with an optional `{ enabled }`
param on `useProjects` (defaults to `true`, every existing caller
unaffected). Verified live end to end from two different pages: Ctrl+K
open/close, live-typed results matching `/search`'s own ranking, both
a full keyboard-only selection (Arrow Down, Enter) and a pointer click
navigating correctly and closing the palette, query resetting on
reopen, and confirming both the no-op and the fixed 404 loop while
logged out.

Slice 1 (Socket.IO connection, handshake auth, org room) is done: a
new `attachSocketServer()` wires an authenticated, tenant-scoped
connection onto the real `http.Server` (`index.ts` now builds one
explicitly instead of discarding `app.listen()`'s return value).
Handshake auth reuses `verifyAccessToken()` (the same function
`requireAuth` uses); `join:org` re-runs the real membership check
`requireOrgMembership` does before joining a room, never trusting the
client-claimed org id. Reconnection re-authenticates with whatever
token is current via a function-form `auth` option, verified live by
killing and restarting the dev API server with the browser tab left
open and watching it reconnect and re-join automatically. Two real bugs
were found and fixed while building/verifying this slice, not assumed
away: the handshake-rejection path was originally silent server-side
(now logged, matching every other rejection path in this codebase), and
a dangling lockfile entry for `socket.io-client` (only fixed by
regenerating `pnpm-lock.yaml` from scratch). No real-time feature yet —
this slice is the walking skeleton slices 2-4 (live board updates, live
comments, presence) build on.

Slice 2 (broadcast after commit + live board updates) is done:
`createIssue`/`updateIssue`/`moveIssue` now call a new
`broadcastIssueChanged(projectId, issueId)` after the repository call
resolves and only on real success, emitting into a new `project:{id}`
room (joined/left per-page via a new `useLiveIssueUpdates` hook, not
connection-scoped like `org:{id}`). The broadcast helper silently
no-ops when no socket server is attached — correct for every existing
HTTP-level test, not a workaround. **A real race condition found and
fixed live, twice**: a fresh page load's `join:org` and `join:project`
fire almost simultaneously, and the project join could reach the server
before the org join's ack had actually set `socket.data.organizationId`
— caught with two real browser tabs, not predicted from the code. The
first fix attempt still left a gap open before the very first `connect`
event; the real fix resets a `whenOrgRoomReady()` promise synchronously
inside `connectSocket()` itself (`shared/socket/socket-client.ts`), and
again on every `disconnect`. Verified live end to end with two browser
sessions: a drag and a create on one tab both appeared live on the
other with no reload, and — the harder case — killing and restarting
the dev API server with a tab left open confirmed it reconnected and
rejoined *both* rooms automatically, with a real subsequent drag still
broadcasting correctly afterward.

Slice 3 (live comments — `issue:{id}` room) is done: `broadcastIssueChanged`
now targets both `project:{id}` and `issue:{id}` in one emit (chained
`.to()` unions the rooms), and a new `broadcastIssueCommented` targets
only `issue:{id}` — comments never render on the board, so project-room
viewers don't need to hear about them. New `join:issue`/`leave:issue`
mirror `join:project`'s verification shape, and a new
`useLiveIssueDetailUpdates` hook wires `IssueDetailPage` to both events.
**A deeper version of slice 2's exact race condition, found live
again**: slice 2's fix (swap a single Promise on `connect`/`disconnect`)
still silently orphaned any `.then()` already attached to the *old*
promise instance the moment it got swapped — React StrictMode's
dev-only connect/disconnect churn made this the common case for
`join:issue`, not rare, proven by counting `"joined issue room"` log
lines across a full run (zero from the app's own hook, one from a
direct hook-free manual test). Real fix: `whenOrgRoomReady()` is now a
resolver *queue* against a plain boolean, not a single swapped Promise
— correct regardless of how many connect/disconnect cycles happen
in between. Verified live: a comment on one tab appeared live on
another; dragging the same issue's card on the board live-updated a
separate detail-page tab's status badge *and* timeline; and a full
API kill/restart with a detail page open confirmed it reconnected and
rejoined both `org:{id}` and `issue:{id}`, with a subsequent comment
still broadcasting correctly afterward.

Slice 4 (presence on an issue — last slice in this phase) is done: a
genuinely different shape from slices 1-3 — ephemeral, in-memory only
(`Map<issueId, Map<socketId, {userId, name}>>` in
`realtime/socket-server.ts`), no DB table, no `issue_events` row.
Presence rides on the existing `join:issue`/`leave:issue` handlers
rather than new events; `SocketData` gained a lazily-cached `name`
(fetched once, only by sessions that actually open an issue, reusing
`auth.repository.ts`'s existing `findUserById`). **Verified live with a
genuinely different second user**, not two tabs of the same account —
this app has no invite flow yet, so a real second org member was seeded
directly and driven through a real `socket.io-client` connection with a
real `signAccessToken()`-issued token. Confirmed the actual rendered
page (not a simulated event) showed "Presence Viewer is also viewing"
the moment that connection joined, and that the line disappeared the
instant a real `.disconnect()` fired — proving the disconnect-triggered
cleanup path specifically, not just a clean unmount. **Phase 6 is now
fully complete.**

Slice 1 (board data model + read-only board view) is done: `board_rank`
column (a Postgres `numeric`, never a float — see ADR 0007 for the whole
ranking scheme), a two-step nullable-add-then-backfill migration, a new
unpaginated `GET .../projects/:projectId/board` endpoint, and a new
read-only `ProjectBoardPage`. Also fixed a regression this slice's own
board view would otherwise have exposed: `update()`'s existing
status-change path now re-ranks an issue to the end of its new column.

Slice 2 (move endpoint — bisection + rebalancing) is done: `PATCH
.../issues/:issueId/move`, plain up/down/move-to-column buttons on
`BoardCard`. **Caught and fixed a real bug via live testing, not
assumption**: `numeric`'s `/` operator turned out not to be
unlimited-precision the way `+`/`-`/`*` are (Postgres computes a
heuristic ~16-significant-digit result scale for division) — the
original `MAX_RANK_SCALE = 20` was unreachable and would have let `/`
silently round two distinct ranks together before the rebalance safety
net ever fired. Fixed (now 10, with real margin) and verified live
against real seeded data via `psql`, not just the automated test — see
ADR 0007's updated Decision section for the full finding.

Slice 3 (real drag & drop with optimistic updates) is done: `@dnd-kit/
core` + `@dnd-kit/sortable` replace slice 2's buttons entirely, calling
the same `useMoveIssue` mutation from `onDragEnd`. **Another real bug
caught live**: an early version made the whole card (including its
title link) the drag handle, on the theory that `PointerSensor`'s
activation distance alone would disambiguate a click from a drag — it
didn't, completing a drag actually navigated to the issue detail page.
Fixed with a dedicated drag-handle button (the standard fix), which
needed `Card` converted to `forwardRef` for `useSortable`'s
`setNodeRef`. Optimistic update lives in `useMoveIssue`'s `onMutate`/
`onError` (TanStack Query's own mechanism, not a parallel local-state
layer). Verified live end to end: cross-column and within-column
pointer drags via the real API response, a mocked 409 confirming
rollback to the exact pre-drag state, and an actual keyboard-only pass
(focus, Space, arrow key, Space) producing a real successful move
request.

Slice 4 (sprints — the last slice in this phase) is done: new ADR 0008
designs the full `planned` → `active` → `completed` lifecycle (chosen
over a minimal two-state model with the owner — see the ADR), a new
`sprints` table with a **database-enforced** at-most-one-active-sprint
constraint (a partial unique index, not a service-layer check —
verified live and with a concurrent-start race test), and a nullable
`issues.sprintId`. `PATCH .../sprints/:id/complete` returns its
remaining issues to the backlog in the same transaction and tags their
`issue.sprint_removed` events with `reason: "sprint_completed"`, so the
timeline can tell an automatic release apart from a manual
drag-to-backlog. New `PATCH .../issues/:issueId/sprint` (assign/
unassign, same conditional-version-UPDATE shape as `move`) and a new
unpaginated `GET .../backlog` composing the whole working view in one
call. New `ProjectSprintsPage`: a sprint-history list with Start/
Complete actions, plus a backlog/active-sprint drag surface using
`@dnd-kit/core`'s plain `useDraggable`/`useDroppable` (membership only,
not `@dnd-kit/sortable`'s ordering — this page doesn't need insert-
before-this-card semantics, see ADR 0008). Verified live end to end:
created and started a sprint, dragged an issue between backlog and
active sprint both ways via real pointer drags and a full keyboard-only
pass, and completed the sprint, watching its issue return to the
backlog and the timeline update correctly — all against the real API.

Phase 4 (React depth) is **fully done** across three slices — every
bullet in its original checklist is covered: cursor pagination (slice 1,
a real composite index + measured `EXPLAIN ANALYZE` proof, `useIssues` on
`useInfiniteQuery`, a new dedicated `GET .../issues/:issueId` endpoint +
`useIssue` hook fixing a regression pagination would've caused in
`IssueDetailPage`), status filter + sort with the URL as the source of
truth (slice 2, `?status=`/`?order=` on the same endpoint,
`ProjectDetailPage` reading/writing both via `useSearchParams`), and
reusable list states + a real error boundary (slice 3, new `Skeleton`/
`EmptyState` primitives in `shared/ui`, reused the already-existing
`ErrorText` for query errors, and a class-component `ErrorBoundary`
wrapped once in `App.tsx` — this app had zero error boundaries before,
confirmed by actually throwing and watching it recover, not just reading
the code). Full detail in `docs/roadmap.md`'s Phase 4 checklist.

Phase 3.5 (Design system extraction) is fully done across four slices —
the semantic token tier + dark mode infrastructure, migrating every
component onto it, a shadcn-derived base component set in `shared/ui`
(`Button`, `Input`, `Textarea`, `Select`, `Field`, `Card`, `ErrorText`),
and the public `/design-system` route documenting all of it live. Full
detail lives in `docs/roadmap.md`'s Phase 3.5 checklist; don't duplicate
it here.

Phase 3.6 (Visual identity) **restarted 2026-09-30**: slice 2a (design
foundation) is done. The owner chose palette A: warm `stone` neutrals, a
slate-teal accent, Inter for text and Newsreader for page titles and big
numbers only (ADR 0013). Only tokens and type changed; the palette is now a
value change in `semantic.css`/`primitives.css`. Contrast was measured on the
real tokens (the `border-input` gap it found was fixed in 2c). Slice 2b
(persistent navigation shell) is done: a layout route with a sidebar widget
(ADR 0014), the bell moved into it, and a mobile drawer. Slice 2c
(public screens and form controls) is done: an auth layout route, `/` now
redirects, control borders fixed to 3:1 (`stone-450`, ADR 0015), error text
darkened. Slice 2d
(page structure) is done: `Page`/`PageHeader` in `shared/ui` frame every
logged-in page, and the duplicated in-page links are gone. Slice 2e
(data screens) is done: one shared issue face, column headers with counts,
dashed empty states, sprint status badges, form surfaces, a timeline rail.
Slice 2f
(overlays and the design-system page) is done, so **Phase 3.6 is complete**:
the palette-A look (neutral gray after the owner found warm stone brownish, ADR 0016; icons from Lucide) is on every screen and overlay, with a Light/Dark/System theme switch in the sidebar (ADR 0017), `/design-system` documents it
with a theme switch, and a pre-existing command-palette bug (Esc after a
no-reload login left it stuck) was found and fixed. A later bug fix
(ADR 0018) made board and sprint cards draggable from anywhere, with a live
column preview and no accidental navigation after a drag. What follows
is the history of the earlier, paused slice 1: it was **paused after a
deliberately minimal slice 1**: real structural improvements (hover/focus states, shadow-based
card elevation, softer radii, a `StatusBadge` status-color system) are in,
proven on `ProjectsPage` and `IssueDetailPage`, but the color story is
intentionally plain — a hand-crafted deep-blue accent on the stock `gray`
neutral scale, not a fully considered palette. Slice 2 (rolling polish out
everywhere) and any further aesthetic work are explicitly deferred by the
owner's own call, in favor of building out the full feature set first.
(The flagged design pass has now been raised and started, see above.)
Update this line when a phase completes.

---

## Working agreement (mandatory)

1. **Design before code.** For any non-trivial task, explain the approach,
   the alternatives, and the tradeoffs *first*. Write code only after the
   owner has engaged with that. Use plan mode for anything spanning >2 files.
2. **One vertical slice per session.** Not "build auth" — "login endpoint +
   contract + form, end to end". Never mix schema + API + UI + infra changes
   in a single unreviewed block.
3. **Explain as you go.** When introducing an unfamiliar pattern, say what it
   is and why it is used here. Assume the owner will be asked about it later.
4. **Never commit, never push.** Stage nothing, run no `git commit`.
   When work is complete, output a suggested commit title (and body if useful)
   in the chat. The owner commits manually. This is absolute.
   **No AI attribution trailers** (e.g. `Co-Authored-By: Claude ...`) in any
   commit message or PR description for this project — the owner does not want
   Claude listed as a contributor on GitHub. This overrides any default
   attribution behaviour.
5. **No silent scope expansion.** Build what was asked. If something adjacent
   is broken or missing, name it and let the owner decide.
6. **Tests are part of the slice**, not a later phase. Explain why each test
   exists — a test whose purpose can't be stated shouldn't be written.
7. **Update the docs you invalidate.** Changing a decision means updating or
   superseding the relevant ADR in `docs/adr/`.
8. After each slice, offer a 5-line entry for `docs/learning-log.md` written
   in plain language, for the owner to edit into their own words.

## Stack (locked — see ADRs)

- **Frontend** React 19 + TypeScript + Vite, TanStack Query, React Hook Form,
  Zod, React Router, Tailwind v4, shadcn-derived components, Recharts
- **Backend** Node + TypeScript + Express, Socket.IO, Zod, JWT, Argon2id
- **Database** PostgreSQL 16 (native locally), **Drizzle ORM**
- **Shared** `packages/contracts` — Zod schemas as the single source of truth
- **Later** GitHub Actions, S3-compatible object storage (Cloudflare R2). Hosting is Render + Neon (ADR 0045); Docker is skipped for now and Redis only comes with a second server instance

---

## Architecture contract

### Repository layout

```
apps/api            Express API
apps/web            React SPA
packages/contracts  Zod schemas + inferred types, shared by both
docs/               architecture, roadmap, ADRs, learning log
```

### API — layered modules

```
apps/api/src/modules/<feature>/
  <feature>.routes.ts       HTTP wiring only
  <feature>.controller.ts   req/res only — parse, call service, format
  <feature>.service.ts      business rules, transactions, domain events
  <feature>.repository.ts   Drizzle queries only
```

**Hard rules**
- Controllers never touch the database.
- Services never see `req` or `res`.
- Repositories contain no business logic.
- **Every repository function that reads tenant data takes `orgId`.** No
  exceptions. Tenant scoping is enforced in middleware *and* in the query.

### Web — Feature-Sliced Design

Layers, highest to lowest: `app → pages → widgets → features → entities → shared`.

- A layer may import only from layers **below** it. Never sideways, never up.
- `shared/ui` is the design system. It knows nothing about the domain.
- `entities/*` own a domain object's model, API calls and presentational card.
- `features/*` own a single user action (create-issue, move-issue).
- Enforced by `eslint-plugin-boundaries` — a violation is a build failure.

### Contracts

Every endpoint's request and response is a Zod schema in `packages/contracts`.
The API validates with it; the web app infers its types from it. Never hand-write
a duplicate type on the frontend.

---

## Conventions

- **Errors**: one `AppError` type with a machine-readable `code`, an HTTP
  status, a client-safe message, and an optional `details` map for
  field-level validation errors (added Phase 2, for form-shaped requests).
  No raw throws reaching the client. Every request carries a request ID,
  present in logs and error responses.
- **Logging**: `pino`, structured, no `console.log` in committed code.
- **Config**: all env vars validated by Zod at boot. Misconfiguration must
  crash at startup, never at request time.
- **Audit**: state-changing issue operations write an append-only event row
  **inside the same transaction** as the mutation. History is never patched
  after the fact. Activity feed, notifications and analytics all read it.
- **Concurrency**: mutable entities carry a `version` column. Updates send the
  version they read; a mismatch returns `409` with the current server state.
- **Ordering**: board position uses fractional ranking, never integer indexes.
- **Design tokens**: two tiers — primitives (`--color-blue-500`, `--space-4`)
  and semantic (`--color-bg-surface`, `--color-text-muted`). **Components use
  semantic tokens only.** No raw hex, no arbitrary pixel values in components.
  Dark mode redefines the semantic tier and nothing else.
- **Naming**: files `kebab-case`, React components `PascalCase`, DB tables and
  columns `snake_case`, TS `camelCase`.
- **Async**: no floating promises; no `any` without a comment justifying it.

## Commands

Filled in as the project is scaffolded. Keep this section accurate.

```
pnpm dev            # run api + web
pnpm typecheck      # tsc -b (project references) across the workspace
pnpm lint
pnpm test           # vitest — apps/api's suite needs Postgres, see below
pnpm db:generate    # drizzle migration from a schema change (apps/api)
pnpm db:migrate     # apply migrations to $DATABASE_URL
pnpm db:seed        # idempotent local demo data
pnpm test:e2e       # Playwright e2e on its own servers + flowdesk_test (ADR 0020)
pnpm test:e2e:prod # builds, then runs the BUILT app like Render will (one process, production mode) and smoke-tests it (ADR 0046)
```

One-time for e2e: `pnpm exec playwright install chromium`. The e2e run starts
its own API (4100) and web server (5273), so it can run while `pnpm dev` is up.
It is not part of `pnpm test` or the pre-push hook yet.

A Husky `pre-push` hook (`.husky/pre-push`) runs `pnpm typecheck && pnpm lint
&& pnpm test` before every `git push`, so Postgres must be running. It is
installed by `pnpm install` (the `prepare` script). Skip once with
`git push --no-verify`.

Local Postgres setup (one-time, not automated — a fresh clone needs this
before `pnpm db:migrate` works): create a least-privilege role and the two
databases, then put the connection strings in `apps/api/.env` (copy
`.env.example`, never commit the real file):

```sql
CREATE ROLE flowdesk WITH LOGIN PASSWORD '<pick one>';
CREATE DATABASE flowdesk_dev  OWNER flowdesk;
CREATE DATABASE flowdesk_test OWNER flowdesk;
```

## Before you start any task

1. Read `docs/roadmap.md` to see the current phase and its open slices.
2. Skim `docs/adr/` for decisions touching the area you're changing.
3. If the task is bigger than one slice, propose how to split it.
