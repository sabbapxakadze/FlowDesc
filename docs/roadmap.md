# Roadmap

Each phase is a set of **vertical slices**. A slice goes through every layer it
touches and ends in a reviewable, committable state. Work one slice at a time.

Mark slices `[x]` as they land. Update "Current phase" in `CLAUDE.md`.

---

## Phase 0 — Foundations

Goal: the rules, the skeleton, and the design language exist before any feature.

- [x] pnpm workspace, TypeScript project references, shared eslint/prettier
- [x] `apps/api` boots: Express, pino, request IDs, Zod-validated env, `/health`
- [x] `apps/web` boots: Vite, React Router, Tailwind v4
- [x] `packages/contracts` wired into both, proven by one shared schema
- [x] Token scaffold (primitives only): color/spacing/type scale wired into
      Tailwind `@theme`. No semantic layer yet, no component library — this is
      config so raw Tailwind values aren't hardcoded from the first component.
- [x] `eslint-plugin-boundaries` enforcing FSD layers
- [x] Hooks: typecheck + lint run automatically after edits

**Done when** both apps run, share one Zod schema, and a layer-boundary
violation fails the build.

## Phase 1 — Walking skeleton

Goal: prove the architecture end to end before building on it.

- [x] Drizzle connected to local Postgres 16; first migration
- [x] `organizations` + `projects` tables
- [x] `GET /api/v1/organizations/:organizationId/projects` through routes →
      controller → service → repository. Nested under the organization
      rather than flat `/api/v1/projects` — `organizationId` is tenant
      scoping, not a filter; see ADR 0004 and CLAUDE.md's repository rule.
- [x] Contract-typed response consumed by a TanStack Query hook
- [x] Projects list page composed per FSD
- [x] First integration test hitting a real database (tenant-isolation
      shaped: proves org A never sees org B's projects)

**Done when** one trivial feature exists in every layer and is tested.

## Phase 2 — Auth & multi-tenancy ✅ complete

Split into four ordered slices, all shipped.

- [x] `users`, `organizations` (Phase 1), `organization_members`,
      `sessions` schema — all four tables now exist
- [x] Register + Argon2id hashing — registering does **not** log you in;
      that's what Slice 2 added. Register auto-creates a personal
      organization (owner role) in one transaction — verified the
      transaction actually rolls back on a mid-way failure, not just the
      happy path.
- [x] Login → short-lived access JWT (memory only) + opaque refresh cookie
- [x] Refresh rotation with reuse detection (revoke session family) —
      verified on real Postgres and over real HTTP (curl with a cookie
      jar): a reused refresh token fails *and* takes the whole family down
      with it, including tokens that were never themselves reused.
- [x] Logout, single-session and all-sessions — both derived from the
      refresh cookie itself, no access token required
- [x] Roles (Owner/Admin/Member/Viewer) → permission map → `requirePermission`
      — map kept intentionally small (`view_project`, `manage_project`);
      grows with the features that need more, same pattern as the
      `organization_role` enum itself.
- [x] `req.ctx` membership resolution middleware — `requireAuth` →
      `requireOrgMembership` → `requirePermission`, three composable
      pieces. This is what replaced the Phase 1 `TEMPORARY` hardcoded org
      id in `ProjectsPage.tsx` with real auth-derived context.
- [x] **Tenant isolation test suite**: prove Org A cannot read Org B — now
      at the HTTP level (supertest, driving the real middleware chain),
      superseding the Phase 1 repository-level version. Verified live: a
      real, validly-logged-in user from Org A gets a genuine 403 hitting
      Org B's URL, not just a repository-query check.
- [x] Auth UI: login, register, verify-email, forgot/reset-password —
      React Hook Form + Zod throughout.
- [x] Email verification + password reset (single-use hashed tokens) — one
      unified `auth_tokens` table (`purpose` enum) for both, not two
      near-identical tables. Real email via Resend, verified with a real
      inbox: registered with a real address, received the actual email
      (landed in spam — expected for an unverified sandbox sender, not a
      bug), clicked through, confirmed `emailVerifiedAt` set server-side.
      Password reset verified the same way end to end, including
      confirming every prior session was revoked and the new password
      actually works.
- [x] Rate limiting on auth routes — `express-rate-limit`, strict on
      login, moderate on register/password-reset-request. Skipped under
      `NODE_ENV=test` (a shared in-process app would otherwise trip on
      legitimate test traffic) — the mechanism itself is proven by an
      isolated test app, and the real config was independently confirmed
      live: 11 rapid login attempts in dev mode, first 10 return 401, the
      11th returns a genuine 429.

## Phase 3 — Issues core + event system ✅ complete

Slice 1 (create + read) shipped:

- [x] `issues`, `issue_events` schema — `labels`/`issue_labels`/`comments`
      land in later slices
- [x] Human-readable keys (`AUTH-23`) via a per-project atomic counter
      (`projects.nextIssueNumber`, incremented with `UPDATE ... RETURNING`
      inside the create transaction) — verified safe under concurrent
      creates with a real `Promise.all` test, and confirmed the test
      actually catches the race by swapping in a naive `SELECT MAX+1`
      and watching it fail before reverting
- [x] Create / read issue, nested under a project via a new
      `requireProject` middleware (org membership + project-in-org check,
      same defense-in-depth shape as `requireOrgMembership`)
- [x] Domain events written in the mutation's transaction — `issue.created`
      proven with a real Postgres test (one event row per created issue)

Slice 2 (update + optimistic concurrency) shipped:

- [x] Update issue (title/description/status) + `version` column + 409 on
      conflict — conditional `UPDATE ... WHERE version = $expected`, same
      atomic-write pattern as slice 1's counter, verified with a real
      concurrent-update test (two `Promise.all` updates from the same
      version, exactly one succeeds) and the same "break it, watch the
      test fail, revert" rigor as slice 1's counter check. 409 responses
      carry the current server state (`AppError`/`ApiError` gained a
      reusable `data` field for this). New `requireIssue` middleware,
      same shape as `requireProject`.
- [x] `issue.updated` events — payload is the changed fields' new values,
      same minimal-payload precedent as `issue.created`
- [x] Edit UI: inline edit form on the project detail page; a stale save
      is rejected, the list refetches, and a conflict notice shows —
      verified live (edited an issue in the UI, updated it via `curl`
      behind the scenes to bump its version, then saved the stale UI edit
      and confirmed the 409 path end to end)

Slice 3 (labels) shipped:

- [x] `labels` (org-scoped, not project-scoped) + `issue_labels` schema —
      attach/detach live in the `issues` module (they're issue mutations,
      each writes an `issue_events` row) rather than a separate module.
      `labels` itself gets a minimal org-level create+list surface only.
- [x] `issue.label_added` / `issue.label_removed` events, same
      minimal-payload precedent as `issue.created`/`issue.updated`
- [x] Inline label picker in the issue edit form: attach, detach, and
      create-a-new-label-on-the-fly — verified live end to end (created a
      label, attached it, confirmed the duplicate-attach 409 and the
      cross-org-label 404, detached it, confirmed both `issue_events`
      rows via `psql`)
- [x] **Found and fixed a real pre-existing bug** while testing this:
      `isUniqueViolation()` (used for the 409-on-duplicate-key path in
      `projects.service.ts`, and copied into `labels.service.ts` /
      `issues.service.ts` for this slice) checked `err.code`/`err.constraint`
      at the top level, but this drizzle-orm version wraps the real pg
      error under `err.cause` — the check never matched, so a duplicate
      project key silently fell through to a raw 500 instead of the
      intended 409. Fixed in all three places; added the test that would
      have caught it (`projects.repository.test.ts`).
Slice 4 (comments + activity timeline + issue detail page) shipped:

- [x] `comments` schema — source of truth for a comment's body (future
      edit/delete would touch this table), but the *read* surface for
      this slice is entirely the activity timeline: no separate
      `GET .../comments` endpoint. Comment creation lives in the `issues`
      module, same call as labels' attach/detach.
- [x] `issue.commented` events, with the comment body in the payload so
      the timeline never has to join back to `comments` to render it —
      fourth and last use of the transactional event pattern this phase.
- [x] Real activity timeline (`GET .../issues/:issueId/events`, joined to
      `users` for the actor's name) — the ADR 0005 payoff: one feed for
      created/updated/label-added/label-removed/commented. Existing
      mutations (`EditIssueForm`, `LabelPicker`) now also invalidate the
      events query so the timeline updates live without a refresh —
      verified in the browser (edited the issue, attached a label,
      posted a comment; all three appeared in the timeline immediately).
- [x] Real issue detail page (`/projects/:projectId/issues/:issueId`),
      reusing `EditIssueForm` (with its label picker) exactly as
      `ProjectDetailPage` already does, plus the timeline and a comment
      box. `IssueCard`'s title now links to it.
- [x] A real "one issue's whole life" test: create → update → attach
      label → comment, asserting the four resulting events come back in
      chronological order with the correct actor name on each.

## Phase 3.5 — Design system extraction ✅ complete

Goal: by now there are real screens (auth forms, project list, issue detail,
activity timeline) to draw a design system *from*, instead of guessing one
upfront. This is a deliberate pause to consolidate, not new product features.

Slice 1 (semantic tokens + dark mode infrastructure) shipped:

- [x] Audit components built so far; extract repeated patterns into semantic
      tokens (`--color-bg-surface`, `--color-text-muted`, `--radius-card`, ...)
      — derived from a real audit of all 21 `className=`-using files, not
      guessed. Values reference Tailwind v4's own generated primitive
      variables (`var(--color-gray-500)`, etc.), not hardcoded hex.
- [x] Dark mode via `@media (prefers-color-scheme: dark)` redefining the
      same semantic tier, plus a `[data-theme="dark"]` override ready for
      a future manual toggle (none built yet — no toggle UI in this slice).
      Verified live: this machine's real OS dark-mode preference made the
      app render dark automatically, no code path beyond the media query.
- [x] Inter actually loads now (`@fontsource-variable/inter`, self-hosted)
      — `--font-sans` already named it since Phase 0, but nothing loaded
      the font file, so every screen had silently been falling back to a
      system font. Found and fixed as part of finishing this layer.
- [x] **Found and fixed a real Tailwind v4 behavior** while verifying this:
      `@theme` silently tree-shakes declared variables it can't detect a
      utility-class consumer for via static source scanning — most of the
      new semantic tokens were silently missing from the compiled CSS
      output until switched to `@theme static` (confirmed by reading the
      actual generated stylesheet, not by trusting the source file).
      Component migration (slice 2) will give these tokens real utility
      consumers, but `static` is still correct going forward since new
      tokens will keep getting added before their first consumer exists.
Slice 2 (component migration) shipped:

- [x] Rewrite existing components to consume semantic tokens only, remove any
      raw Tailwind values that snuck in — 17 of 21 `className=`-using files
      needed the swap (the other 4 — `ForgotPasswordPage`, `LoginPage`,
      `RegisterPage`, `LabelBadge`'s one intentional exception — already had
      no raw semantic-category class to migrate). First use of Tailwind's
      arbitrary-value bracket syntax (`text-[var(--color-text-muted)]`)
      anywhere in the codebase. Automated proof, not just a visual check: a
      grep for every raw class in the mapping table returns zero matches
      outside the two named exceptions (`LabelBadge`'s `text-white`/
      `rounded-full`, both data-driven, not themed).
- [x] Dark mode: redefine the semantic tier, verify nothing else needed to
      change — now actually true, since slice 1 only `body` consumed the
      tier. Verified live: real card/button computed styles (border color,
      background, radius) match the original raw Tailwind values exactly in
      light mode (zero regression) and correctly flip in dark mode, checked
      via `getComputedStyle` on real rendered elements, not just the token
      file's own custom properties.
Slice 3 (shadcn-derived base components) shipped:

- [x] Pull in shadcn-derived components into `shared/ui` as actually needed,
      rewritten onto our semantic tokens — `Button` (`class-variance-authority`
      variants, the real shadcn authoring pattern), `Input`, `Textarea`,
      `Select`, `Field` (lifted from `RegisterForm`'s own local copy of the
      same pattern), `Card`, `ErrorText`, plus `lib/cn.ts` (`clsx` +
      `tailwind-merge`, shadcn's standard class-merging helper). No Radix —
      nothing built yet needs a dialog/portal/combobox.
      14 forms/cards refactored to use them instead of hand-rolled markup.
      Two small, named normalizations along the way (not silent): the 4 auth
      forms' submit buttons now consistently get `text-sm` (they never had
      it before, an inconsistency, not a choice), and `LabelPicker`'s
      "Create" button padding now matches every other small button
      (`px-2`→`px-3`). Verified live: registered/logged in, created a
      project and an issue, edited it with the label picker, posted a
      comment — full real behavior through the new components, not just a
      visual look — then confirmed via `getComputedStyle` that a migrated
      card/button's border, radius, and background match the pre-slice
      values exactly in light mode and still correctly flip in dark mode.

Slice 4 (`/design-system` route) shipped:

- [x] `/design-system` route documenting every token and base component —
      public, not behind `RequireAuth` (it documents the UI system, not
      app data — "portfolio material" per ADR 0006 means anyone can see
      it). All 11 color tokens + 2 radius tokens as live swatches (a
      hardcoded, typed list, not parsed from `semantic.css` — small and
      stable enough that drift would be a visible diff), plus every
      `shared/ui` component rendered as a real working instance.
      Found and fixed a real bug before it ever reached the browser:
      building an arbitrary-value class via a template literal
      (`` `bg-[var(${token.cssVar})]` ``) doesn't work — Tailwind's JIT
      scanner reads literal source text, not runtime-evaluated strings,
      so it can never see the resolved class name. Fixed with a lookup
      table of complete literal strings per token. Verified live:
      confirmed the route loads without logging in, and toggled dark mode
      on the page itself — every swatch and every live component
      responded, checked via `getComputedStyle`, not just eyeballed.

**Done when** dark mode is a ~20-variable change and every component so far
uses only semantic tokens. *(True as of slice 2 — confirmed by the grep in
slice 2's verification, not just assumed from the diff.)*

## Phase 3.6 — Visual identity ✅ complete (2026-09-30)

Goal: Phase 3.5 built the *infrastructure* for consistent design (tokens,
dark mode, a shared component library) — it deliberately didn't touch the
actual aesthetic. This phase started spending that infrastructure on a
real visual identity, but slice 1 went through two direction changes
(Linear-style → Notion-inspired warm coral/stone → simplified) before the
owner made an explicit call: finish the product's functionality first
(Phases 4-8) and do one real, considered design pass later, once there's
more surface to design for, rather than iterating on color in the abstract
now. Slice 1 landed in a **deliberately minimal** form as a result — real
structural improvements (hover/focus states, shadow-based card elevation,
softer radii, a status-color system) kept, but the color story simplified
to a plain deep-blue accent on the stock cool `gray` neutral scale instead
of a hand-tuned warm palette. Slice 2 (rolling polish out to every
remaining screen) and any further aesthetic work are **explicitly
deferred** — see the flagged revisit point below.

Slice 1 (visual foundations, kept minimal) shipped:

- [x] A real accent color — FlowDesk's own deep blue (`--color-accent-*`,
      an 11-shade hand-crafted primitive scale, hue ~250 in OKLCH,
      replacing the placeholder `--color-brand-500`), used for links,
      focus rings, and the in-progress status. Originally warm coral on
      warm `stone` neutrals (a fuller Notion-inspired take); simplified to
      deep-blue-on-`gray` per the owner's explicit call to keep this slice
      minimal rather than keep tuning color — the `stone` experiment is
      gone, semantic tokens reference the stock `gray` scale again.
- [x] A fixed 3-color status system (`--color-status-todo/in-progress/done`)
      as new semantic tokens, applied via a new `StatusBadge` (a colored
      dot + label) — replacing plain status text on issue cards and the
      issue detail page.
- [x] Cards drop the hard border for a soft shadow + background contrast
      (`bg-page` = `gray-100`, `bg-surface` = white) — reads as elevated
      without an outline. Softer, larger corners (`radius-card` → 12px,
      `radius-control` → 6px).
- [x] Every `shared/ui` component gets real hover/focus states — there
      were none anywhere before this (confirmed via the Phase 3.5 audit).
      `Button` hover (opacity shift) and `Card` hover (shadow increase)
      verified via `getComputedStyle` during a real simulated hover, not
      just eyeballed. A real accent-colored focus-visible ring on every
      form control — a genuine accessibility gap closed, not just a style
      change.
      Found and fixed a real layout bug while verifying live:
      `StatusBadge` (an inline element) replacing a block-level status
      `<p>` on the issue detail page let the adjacent "Edit" button flow
      onto the same line with no gap — caught by screenshot, not by
      reading the diff, fixed with an explicit flex row.
      Proven on `ProjectsPage` and `IssueDetailPage` (its richest screen)
      in both light and dark mode.
- [x] Slice 2a — **Design foundation (2026-09-30).** The revisit point was
      reached (Phase 8 done). Owner chose palette A from
      `docs/design/direction-prototype.html`: warm `stone` neutrals,
      slate-teal accent ramp, Inter for text, Newsreader (serif) for page
      titles and big numbers only. Only tokens and type changed: see
      ADR 0013. Contrast measured in the browser on the real token pairs
      (both modes); `text-warning` and the to-do status dot were below
      threshold (also before this slice) and were fixed; `border-input`
      (about 1.5:1 vs 3:1) is known and left. Found that the old font
      stack named `"Inter"` while fontsource registers `"Inter Variable"`,
      so Inter was probably never applied; fixed. Checked live on
      Projects, Board, Analytics and `/design-system`; Analytics in
      both modes. Not checked: issue detail, login and the other pages.
- [x] Slice 2b — **Persistent navigation shell (2026-09-30).** React Router
      layout route (`app/AppShell.tsx`) + `widgets/sidebar`: Projects,
      Search, the org's projects (the current one expands to Issues, Board,
      Sprints, Analytics), Design system, user and Log out. The bell moved
      into it (no longer fixed top-right, so it no longer overlaps links).
      Mobile: top bar + drawer. Five new sidebar tokens; see ADR 0014.
      Checked live: all seven protected routes have the sidebar with the
      right current item (`aria-current`), public pages have none, logout and
      the logged-out redirect work, a real teammate comment updated the
      bell badge live from inside the sidebar, the drawer opens/closes by
      button, Escape and link at 420px, contrast of the sidebar token pairs
      measured in both modes. Not verified: Tab-key order (focus rings were
      checked by focusing programmatically), browsers other than Chrome.
      Not done, on purpose: the per-page links remain; no Ctrl+K button, no
      theme toggle.
- [x] Slice 2c — **Public screens and form controls (2026-09-30).** Auth
      layout route (`app/AuthLayout.tsx`): login, register, verify, forgot and
      reset are a centered card with the brand, plus cross-links (Create an
      account / Log in / Back to log in). `/` is now a redirect and the Phase 0
      health page is deleted (its job, proving one Zod schema on both sides,
      is done). Control borders fixed to 3:1 with one new primitive
      (`stone-450`) in light mode and `stone-500` in dark; error text
      `red-600` to `red-700` (4.37:1 on the page before). Inputs/selects/
      textareas got a surface background, padding and invalid state; auth forms
      got `autoComplete`. See ADR 0015. Checked live: contrast measured in
      both modes, wrong password keeps the fields and shows the error, valid
      login lands on `/projects`, `/` redirects both ways, register validation
      shows red borders and messages, Projects and the issue list still fine
      with the new controls. Screenshots seen: login (light, 1440px), register
      (dark, 1440px, and dark with validation errors at 420px). Forgot, reset
      and verify were only checked by DOM (one main, no sidebar, no sideways
      scroll, right text), not by eye. Not verified: Tab-key order, verify-email with a
      real token, reset with a real emailed token, browsers other than Chrome.
- [x] Slice 2d — **Page structure for logged-in pages (2026-09-30).** New
      `Page` (the one `<main>`, responsive padding, reading width `max-w-5xl`
      centered or wide `max-w-7xl`) and `PageHeader` (eyebrow, serif title,
      optional back link, meta row) in `shared/ui`; all seven logged-in pages
      use them, and so do their loading and not-found states, which had no
      `<main>` before (ten places). Project pages are now titled Issues /
      Board / Sprints / Analytics with the project name as the eyebrow, matching
      the sidebar. Removed the duplicated links ("Board →", "Sprints →",
      "Analytics →", "Search →", "← All projects" and the project back links);
      the issue page keeps "← project", and its edit mode now shows an "Edit
      issue" header. Checked live: one main and one h1 on each page, no leftover
      links, bogus project/issue URLs render their message inside a main with
      the sidebar, status filter still writes `?status=`, a real pointer drag
      on the board still moves a card (ANL-2 Todo to In progress), mobile
      layout has 16px padding and no sideways scroll. Note: the automated
      browser would not go below 467px wide, so the narrow check was at 467px,
      not 420px. Not checked: saving or cancelling an issue edit, analytics
      range selects and the sprints drag surface after the change, light-mode
      screenshots of every page (light: issue detail only), dark 1440px.
      Seen, not fixed: a bogus issue URL shows the skeleton for about 7 seconds
      before "Issue not found." because the 404 is retried.
- [x] Slice 2e — **Data screens (2026-09-30).** One `IssueSummary` face shared
      by the issue list card, board card, sprint card and the drag overlay
      (it was hand-written four times); a `DragHandle` SVG grip instead of a
      text glyph (same button, aria-label and dnd-kit props; adds `touch-none`);
      `ColumnHeader` (status dot, name, count) for board columns and sprint
      zones; `EmptyState block` (dashed box, also a clearer drop target) on
      data screens; `SprintStatusBadge` (dot + label, reuses the three status
      colours, no new tokens); the project, issue and sprint create forms sit
      on a card surface; project keys are pills; the timeline has a left rail
      with dots (rail uses `border-input` so it is actually visible, the first
      attempt with `border-default` was ~1.1:1 and invisible); the attachment
      file picker is styled with `file:` utilities. `STATUS_DOT_CLASSES`
      moved into `statusLabels.ts` so StatusBadge, ColumnHeader and
      SprintStatusBadge share one colour table. Checked live: a real pointer
      drag on the board and one on the sprint page (after creating and
      starting a sprint), a keyboard drag on the board (one move request, no
      strays), creating an issue, opening edit-in-place; screenshots seen:
      board, sprints, issue detail (light and dark), issue list (dark).
      Not verified: saving an edit-in-place, creating a project or sprint
      beyond the one I made, uploading a file, narrow-width screenshots,
      Search results, light-mode Issues list, and contrast numbers for the new
      pieces (the dashed border and timeline dots use `border-input`, already
      measured at 3:1 in slice 2c; nothing else new carries text). Note: while
      testing, the API log showed several board moves I did not make, most
      likely someone else using the QA account at the same time; a single
      keyboard drag on its own produced exactly one move.
- [x] Slice 2f — **Overlays and the design-system page (2026-09-30).**
      Command palette: top-anchored and centered (`mx-auto mt-24`; without an
      explicit horizontal margin it sat at the far left, because Tailwind's
      preflight zeroes the dialog's default margin), rows use `IssueSummary`
      (the fifth copy of the face is gone), a clearer highlight, an Esc/Enter
      hint, and real combobox/listbox/option semantics with
      `aria-activedescendant` and `aria-selected` that follow the arrow keys.
      Bell: the emoji became an SVG in the sidebar colours, unread rows are
      default-colour and medium weight while read rows are muted, the unread dot
      is larger. `/design-system` rewritten: a System/Light/Dark switch (sets
      `data-theme`, restored on leaving), token groups for surfaces and text,
      borders, status, charts and the shell, the stone scale with `stone-450`
      marked, the accent ramp, a typography section, and the newer components
      (Button full width, invalid controls, ColumnHeader, EmptyState inline and
      block, Skeleton, shell preview); swatches use inline `var(--token)` so the
      class lookup tables for tokens are gone. **A pre-existing bug found and
      fixed while verifying the palette:** its `close`-event listener attached
      only at mount, but the dialog is not rendered while logged out, so after
      a login without a reload Esc closed the dialog while `isOpen` stayed true
      and the next Ctrl+K silently did nothing (`useEffect` now depends on
      `organization`). Reproduced first, then re-checked in the exact scenario
      (fresh logged-out load, log in, Esc then Ctrl+K three times).
      Checked live with real keys: open, type, arrows (one option selected at a
      time, `aria-activedescendant` matches), Enter navigates and closes, a
      reopened palette starts empty, no-match message, Esc closes; bell with a
      real unread notification, Mark all read; the design-system toggle in all
      three modes, and that leaving the page removes `data-theme`. Contrast
      measured for the palette highlight (15.7:1 default text, 6.1:1 muted, dark
      13.9 and 5.9) and the unread dot (3.3:1 on the dark surface, a
      non-text mark that needs 3:1). Not verified: the palette and bell in dark
      mode by eye, narrow width, a screen reader (only the ARIA attributes were
      checked), bell click-through on a real unread row, browsers other than
      Chrome.

**Revisit point (flagged, not scheduled)**: once Phases 4-8 have built out
the full feature surface — real screens for filtering/pagination, the
Kanban board, real-time presence, search/notifications, and analytics —
there's enough actual product to design for instead of guessing ahead of
it. That's the natural point for one real, considered design pass (finish
slice 2, revisit the warm-vs-cool neutral and accent-color decision with
real screens in hand, add a persistent nav shell). Raise this explicitly
with the owner when the roadmap reaches that point, rather than waiting to
be asked.

**Follow-up (2026-09-30, after the rollout):** the owner found the warm `stone`
neutrals brownish, so the neutrals became pure `neutral` gray (page, sidebar and
dark mode now gray/near-black), and all icons moved to Lucide (bell, drag grip,
menu, close, label remove, back arrow). See ADR 0016. Re-measured 22 contrast
pairs in both modes, all pass; checked live: board in light and dark, a keyboard
drag after the icon swap (one move), and that the bell and grip icons render as
Lucide. Not re-checked by eye after the change: every other page.

**Theme switch (2026-09-30, owner request):** Light / Dark / System in the
sidebar footer, the mobile drawer and `/design-system`, saved in localStorage,
applied before first paint by an inline script in `index.html`, synced across
tabs, plus `color-scheme` so native controls match. See ADR 0017 for what was
verified and what was not (no scrollbar pixels, no Firefox/Safari).

**Done when** every existing screen reflects a deliberate visual direction,
not just the ones touched directly in the minimal slice 1. Met by slices 2a-2f:
one palette and type pair through the tokens, a shell, and every screen and
overlay on it. What was and was not checked is recorded per slice above.

## Phase 4 — React depth ✅ complete

Slice 1 (cursor pagination on the issues list) shipped:

- [x] Server-side cursor pagination on `GET .../projects/:projectId/issues`
      — keyset (`WHERE (created_at, id) < (cursor)`, not `OFFSET`), ordered
      `created_at DESC, id DESC` with `id` as the tie-breaker. `limit`
      defaults to 25, capped at 100 (`listIssuesQuerySchema`). Response
      gained `nextCursor: string | null`; `null` means no further pages —
      no separate `hasMore` field.
- [x] TanStack Query conventions: `useIssues` rewritten on
      `useInfiniteQuery` (`getNextPageParam` reading `nextCursor`), same
      `issueKeys` factory the old `useQuery` version used — no key-shape
      change needed. `ProjectDetailPage` flattens `data.pages` and renders
      a plain "Load more" button (`hasNextPage`/`fetchNextPage`); no
      skeletons/infinite-scroll treatment yet — that's slice 2's "reusable
      list, empty states, skeletons" item, not this slice's.
- [x] **Documented index + `EXPLAIN ANALYZE` before/after**, proven against
      5,000 seeded rows in a throwaway project (not assumed): before
      (single-column `issues_project_id_idx`, a keyset query 2,500 rows
      deep) — `Seq Scan` + top-N sort, "Rows Removed by Filter: 2505",
      1.111ms. After swapping to the composite
      `issues_project_id_created_at_id_idx` on
      `(project_id, created_at, id)` — first attempt (the `OR`-expanded
      cursor condition, `created_at < x OR (created_at = x AND id < y)`)
      still fell back to filtering every row past the cursor by hand
      instead of a real index condition, only ~2x faster (0.490ms).
      Switching the query to Postgres's row-constructor comparison
      (`(created_at, id) < (cursor_created_at, cursor_id)`) produced a
      genuine composite `Index Cond` with zero cursor-related row
      filtering, 0.077ms — ~14x faster than the pre-index baseline, and
      critically, cost now scales with `limit`, not with page depth. The
      repository's cursor condition uses this row-constructor form, not
      the `OR` form, specifically because of this measurement — see the
      comment on `listByProject` in `issues.repository.ts`.
- [x] **Found and fixed a real regression this slice's own change would
      have caused**: `IssueDetailPage` had no dedicated "get one issue"
      endpoint — it found the issue by scanning the (previously complete)
      issues list. Once that list only returns its first page, an issue
      past page 1 would silently fail to load on direct navigation. Fixed
      with a new `GET .../issues/:issueId` endpoint (reusing `requireIssue`,
      which already fetches and 404s the row) and a new `useIssue` hook;
      `EditIssueForm` now also invalidates `issueKeys.detail(issue.id)`
      alongside the list, since the detail view no longer shares the
      list's cache entry. Verified live: navigated directly to an issue
      created well past page 1 (27 seeded issues, 25-item pages) and
      confirmed it now loads correctly.
Slice 2 (status filter + sort, URL-driven) shipped:

- [x] Server-side status filter (`?status=todo|in_progress|done`, plain
      `eq()` — no new index; status is a 3-value filter applied on top of
      an already-selective `project_id` equality, not worth a dedicated
      or wider index at this scale) and sort direction (`?order=asc|desc`
      on `created_at`, the only sortable column today — not a general
      multi-column sort system). Both added to `listIssuesQuerySchema`;
      `listByProject`'s `order` flips the `ORDER BY` direction and the
      cursor's comparison operator (`<`/DESC vs `>`/ASC) together, in one
      place, so they can't drift apart into an inconsistent combination.
- [x] **EXPLAIN ANALYZE sanity check** (5,000 seeded rows, reusing slice
      1's approach): both `status` filtering and `order: asc` confirmed
      to still hit `issues_project_id_created_at_id_idx` as an `Index
      Scan`/`Index Scan Backward` — status as a post-index `Filter`
      (expected, not a regression), `asc` as a genuine forward scan on
      the same composite index (Postgres btrees are bidirectionally
      scannable — no second index needed). Re-verified with a cursor
      present too (the actual paginated-request shape), confirming the
      row-constructor `Index Cond` from slice 1 still applies with both
      `<` and `>` comparators.
- [x] URL as the source of truth: `status`/`order` live in
      `ProjectDetailPage`'s `useSearchParams()`, not component state —
      landing directly on a `?status=...&order=...` URL renders already
      filtered/sorted, verified live (not just wired). Filter/order
      changes are a different `issueKeys.list(projectId, filters)` cache
      key entirely, so `useInfiniteQuery` resets to a fresh first page
      automatically — no manual pagination-reset code needed.
      `CreateIssueForm`/`EditIssueForm`'s existing unfiltered
      `invalidateQueries({ queryKey: issueKeys.list(projectId) })` calls
      needed no changes: TanStack's partial key matching means that
      shorter, filter-less key still invalidates every filtered variant.
- [x] Filtered empty state gets its own message ("No done issues.") 
      distinct from the unconditional "No issues yet." — verified live
      against a project with issues in other statuses but none matching
      the active filter.
Slice 3 (reusable list states + error boundary) shipped:

- [x] `Skeleton` and `EmptyState`, new `shared/ui` primitives — `Skeleton`
      a plain pulsing block sized via `className`, same shape as
      shadcn's own; `EmptyState` a consistent wrapper for the
      muted-text "nothing here" message. Deliberately not one generic
      `<List>` component: `ProjectsPage`, `ProjectDetailPage`, and the
      issue-detail timeline differ enough in surrounding chrome (create
      form, filter controls, nested-timeline shape) that one component
      covering all three would need enough props to become the
      premature abstraction CLAUDE.md warns against. Also deliberately
      no `<table>` primitive — nothing in the app renders tabular data
      today, the roadmap's "table/list" wording predates knowing that.
- [x] Reused the *already-existing* `ErrorText` (built for form errors,
      Phase 3.5) for list-level query errors on `ProjectsPage` and
      `ProjectDetailPage` — no new component needed, just applying one
      that was already there.
- [x] Skeletons replace "Loading…" text on `ProjectsPage`,
      `ProjectDetailPage`'s issue list, `IssueDetailPage`'s project/issue
      load, and its activity timeline. Verified live (not just read from
      the diff): an artificial `fetch` delay confirmed the skeleton
      actually renders — surrounding page chrome (header, create form,
      filter controls) stays mounted and stable while only the list
      region shows placeholders, then swaps cleanly to real content with
      zero leftover skeleton nodes.
- [x] **A real `ErrorBoundary`** (`shared/error-boundary/ErrorBoundary.tsx`)
      — a class component (the one place in React's API a function
      component can't do the job; no hook equivalent for
      `componentDidCatch`/`getDerivedStateFromError`), wrapped once
      around the routed content in `App.tsx`. Before this slice the app
      had zero error boundaries anywhere — an unexpected render
      exception white-screened the whole app. Verified live by actually
      throwing (temporarily, in `EmptyState`, reverted immediately after
      confirming): the boundary caught it and rendered the fallback
      ("Something went wrong." + a reload button) instead of a blank
      page — this is the one part of this slice that isn't provable by
      reading the code.
- [x] Filtered empty state (from slice 2) verified live to still render
      correctly through the new `EmptyState` component.
- [~] The `isError`→`ErrorText` query-error path itself (list-level fetch
      failures) was **not independently re-verified live** — attempts to
      simulate a failed fetch in this browser session hit TanStack
      Query's `networkMode` treating the query as "paused" rather than
      erroring, an environment-specific quirk unrelated to this slice's
      code (the `isError`/`error` values themselves are unchanged from
      the already-working logic this slice only swapped the rendered
      element for). Flagged honestly rather than claimed as checked —
      revisit if this ever needs a real confirmation.

## Phase 5 — Kanban board

Slice 1 (board data model + read-only board view) shipped:

- [x] **`board_rank` ordering scheme designed and documented** — new
      ADR 0007: a Postgres `numeric` column (exact arbitrary-precision
      decimal, never `double precision` — no float rounding after
      repeated bisection), all rank arithmetic done in SQL and never
      parsed into a JS number, gap-of-1000 initial spacing, and a
      `scale()`-based rebalance trigger designed now for slice 2 to
      implement. Rank is never sent to the client — not part of the
      public `Issue` contract type — the client only ever expresses
      "put this issue relative to that one."
  - This slice only needed the simple append case (`COALESCE(MAX(board_rank),
    0) + 1000`, in `nextRankSql`) — `create()` assigns it on insert,
    and `update()` now also recomputes it whenever `changes.status`
    genuinely differs from the row's current status (not just present in
    the payload — `EditIssueForm` always resends the current status
    alongside any edit; confirmed the fix doesn't fire on a same-status
    resend). Slice 2 adds the harder bisection-between-neighbors case.
  - Two-step migration (`0008`: nullable column + composite index;
    `0009`, hand-written via `drizzle-kit generate --custom`: a
    `ROW_NUMBER()`-based backfill spacing existing issues by 1000 within
    each `(project, status)` group, oldest-first, then `SET NOT NULL`)
    — confirmed directly in `psql` against real pre-existing dev-DB data,
    not just fresh test rows.
- [x] New `GET .../projects/:projectId/board` endpoint — unpaginated
      (a board's whole point is seeing everything at a glance), ordered
      by `(status, board_rank, id)` matching the new composite index
      exactly. Verified over real HTTP that `board_rank` never appears
      in the response (Zod's default key-stripping on `.parse()` against
      a schema that doesn't declare the field).
- [x] New read-only `ProjectBoardPage` (`/projects/:projectId/board`) —
      three columns, a new `BoardCard` (deliberately not reusing
      `IssueCard`: the action sets are going to diverge once slice 2
      adds move controls). Linked from/to the existing list page. No
      move affordances yet.
  - Verified live: the manual edit form's status change (pre-existing,
    Phase 3 functionality) now correctly repositions an issue to the end
    of its new column on the board — this slice's own regression fix,
    confirmed by actually editing an issue's status in the browser and
    watching it move columns on the board, not just by reading the code.
Slice 2 (move endpoint — bisection + rebalancing) shipped:

- [x] New `PATCH .../issues/:issueId/move` — `{ version, status,
      prevIssueId?, nextIssueId? }`. Neither neighbor appends to the end
      (reuses slice 1's `nextRankSql`); `nextIssueId` present inserts
      before that card, bisecting against `prevIssueId` if given or
      halving `nextIssueId`'s rank if it's the column's first card.
      `prevIssueId` alone is treated as append — always recomputing
      `MAX + gap` fresh is robust against a stale "last card" claim
      rather than trusting it. Neighbors are re-fetched inside the
      transaction, scoped to the *target* column (tenant + column
      validation in one query); a foreign/missing neighbor is a new
      `invalid_neighbor` → `400`.
- [x] **A real bug found via testing, not assumed away**: the first
      implementation checked `scale()` against a threshold of 20,
      matching what ADR 0007 originally specified. Live verification
      against this project's actual Postgres 16 instance showed
      `numeric`'s `/` operator — unlike `+`/`-`/`*` — is *not*
      unlimited-precision: it computes a heuristic result scale around
      16 significant digits total, shrinking further (down to ~12) as
      the integer part grows. A threshold of 20 was unreachable —
      `/` would have silently rounded two distinct deep bisections into
      the *same* stored value long before the "safety net" ever fired.
      Fixed by lowering `MAX_RANK_SCALE` to 10 (real margin below the
      observed ~12-digit floor) and `trim_scale()`-wrapping every
      midpoint (plain division pads its result — `3000::numeric/2` is
      `1500.0000000000000000`, not `1500` — which would otherwise measure
      division's own padding instead of the rank's real precision). ADR
      0007 updated with the full finding. Verified two ways: an automated
      test forcing ~18 iterations of genuinely deepening bisection between
      the same two neighbors and asserting the observed scale never
      exceeds 10; and the same sequence run live against real seeded data
      via the actual HTTP API, watching `psql` directly — scale climbing
      3→10 across 8 real requests, then visibly resetting to a clean
      integer (a real rebalance) before climbing again.
- [x] Always writes an `issue.moved` event (`{ fromStatus, toStatus }`),
      even for a same-column reorder — no carve-out from CLAUDE.md's
      audit convention for a "boring" state change. `IssueDetailPage`'s
      timeline phrases the two cases differently ("reordered this issue"
      vs. "moved this issue to In progress") — verified live for both.
- [x] `BoardCard` gains up/down arrows (disabled at column boundaries)
      and a "Move to…" select, wired through a new `useMoveIssue` hook
      (`features/move-issue` — a real hook rather than a form-inlined
      mutation like `edit-issue`/`create-issue`, since multiple buttons
      across the whole board share it). Verified live: reordering within
      a column and moving across columns both persist and both endpoints'
      cache invalidation (list, board, detail, events) keeps every view
      in sync.
Slice 3 (real drag & drop with optimistic updates) shipped:

- [x] `@dnd-kit/core` + `@dnd-kit/sortable` (+ `@dnd-kit/utilities`) —
      not core alone: sortable's keyboard coordinate getter is what
      makes drag genuinely keyboard-operable (Tab to the handle, Space
      to pick up, arrow keys to move — including across columns, Space
      to drop), not just pointer-draggable. Each column is droppable
      (append) and a `SortableContext`; each card is a sortable drop
      target (insert-before). Replaces slice 2's up/down/move-to-column
      buttons entirely — `BoardCard` calls the same `useMoveIssue`
      mutation slice 2 already built, just triggered by `onDragEnd`
      instead of a click handler.
- [x] **A real bug found via live testing, not assumed away**: the
      first version put the drag `listeners`/`attributes` on the whole
      card, including its title `<Link>`, on the theory that
      `PointerSensor`'s activation distance would disambiguate a click
      from a drag. It didn't — verified live: completing a drag
      actually navigated to the issue detail page mid-drop (dnd-kit's
      synthetic click after a finished drag still fires on the
      original pointerdown target; checking `isDragging` in the Link's
      own `onClick` doesn't help, since that flag has already reset to
      `false` by the time the click event fires). Fixed with a
      dedicated drag-handle button, separate from the `Link` — the
      standard fix, not a click/drag disambiguation hack. `Card`
      (`shared/ui`) needed converting to `forwardRef` for `useSortable`'s
      `setNodeRef` to attach to, same reason `Input`/`Textarea`/`Select`
      already are, for React Hook Form.
- [x] Optimistic update lives in `useMoveIssue`'s `onMutate`/`onError`
      (TanStack Query's own mechanism — snapshot the board cache, splice
      the moved issue into its new position immediately, restore the
      snapshot on failure), not a separate local-state layer — reuses
      the data layer the project already has instead of adding a second
      one. Scoped to the board query only; the list view still just
      refetches on settle.
- [x] Verified live, end to end, including the two things easiest to
      silently ship broken: a real HTTP 409 injected via a mocked route
      confirmed the optimistic move rolls back to the exact pre-drag
      state (a real request fired and was rejected, not just "nothing
      happened"); and an actual keyboard-only pass (focus the handle,
      Space, arrow key, Space) produced a real successful move request,
      not just a visual-only interaction. Both cross-column and
      within-column pointer drags confirmed via the board's real API
      response after the drop, not just the DOM.
Slice 4 (sprints) shipped:

- [x] **Sprint lifecycle designed and documented** — new ADR 0008:
      `planned` → `active` → `completed`, chosen with the owner over a
      minimal active/completed-only model (see the ADR's "Alternatives
      rejected" — the minimal model still needs a transition to reuse
      the active slot, so it saves no real complexity while losing the
      ability to plan ahead). New `sprints` table (`sprint_status` enum,
      `version` for optimistic concurrency, nullable `startDate`/
      `endDate`) and a nullable `issues.sprintId` FK (`onDelete: "set
      null"` — a sprint isn't a tenant boundary, so deleting one returns
      its issues to the backlog rather than deleting them). One
      migration, no backfill needed this time (unlike ADR 0007's
      `board_rank`): the column is nullable from creation.
- [x] **At most one active sprint per project, enforced by the
      database** — a partial unique index
      (`UNIQUE (project_id) WHERE status = 'active'`), not a
      service-layer check-then-write. `PATCH .../sprints/:id/start` is a
      conditional `UPDATE ... WHERE status = 'planned' AND version =
      $expected`; a second concurrent start hits the index violation,
      caught the same `isUniqueViolation()` way as duplicate project
      keys/label names and translated to a real `409
      sprint_already_active` — verified live (tried starting a second
      planned sprint while one was active, confirmed the clear error,
      not a raw 500) and with an automated concurrent-start race test.
- [x] `PATCH .../sprints/:id/complete` returns the sprint's remaining
      issues to the backlog in the same transaction as the status
      change, writing one `issue.sprint_removed` event per issue with
      `reason: "sprint_completed"` — the `reason` field is what lets the
      activity timeline phrase an automatic release differently from a
      manual drag-to-backlog, without a second event type. Verified
      live: completed an active sprint with an issue still in it,
      confirmed the issue reappeared in the backlog and its timeline
      read "moved this issue back to the backlog (Sprint 1 completed)".
- [x] New `PATCH .../issues/:issueId/sprint` (`{ version, sprintId:
      string | null }`, `null` = backlog) — an issue mutation, not a
      sprint one, same conditional-UPDATE-on-version shape as `move`
      (ADR 0007). Writes `issue.sprint_assigned`/`issue.sprint_removed`.
      New unpaginated `GET .../backlog` composes the whole working view
      in one call (`{ activeSprint, backlog, activeSprintIssues }`),
      same "see everything at a glance" precedent as `getBoard`.
- [x] New `ProjectSprintsPage` (`/projects/:projectId/sprints`) — a
      sprint-history list (name, status, Start/Complete buttons gated on
      status) plus a two-zone backlog/active-sprint drag surface. Drag
      via `@dnd-kit/core`'s plain `useDraggable`/`useDroppable` (not
      `@dnd-kit/sortable` — this page only needs container membership,
      not insert-before-this-card ordering, see ADR 0008), with the same
      dedicated-drag-handle fix `BoardCard` needed. Cross-linked from
      the board and list pages. Verified live end to end: created a
      sprint, started it, dragged an issue from the backlog into the
      active sprint and back via real pointer drags, a full
      keyboard-only pass (Tab to the handle, Space, arrow keys, Space —
      confirmed via dnd-kit's own live-region announcer text reaching
      "dropped over droppable area active-sprint"), and completed the
      sprint, watching its issue return to the backlog and the timeline
      update correctly — all against the real API, not mocked.
- [x] **Bug fix: drag and click feel (2026-09-30, owner report).** Whole card is
      the drag source (grip kept for the keyboard), a click guard stops the
      post-drag click from opening the issue, columns preview the move live
      (cards make room, right to left, left to right, skipping a column,
      vertically), every column is one big drop target, pointer-based collision
      detection, hover shadow animates again, no flash between drop and the
      optimistic update, Sprints page gets the same plus a drag overlay. See ADR
      0018. Found by measuring: a 1 degree rotation on the drag overlay broke
      keyboard column moves, and after crossing columns the drop could land in
      front of the card the preview had placed the card after. Verified with real
      mouse and keyboard input, and the server's stored order matched the screen.
      Not verified: real touch input, other browsers; one unexplained miss in a
      scripted batch that later runs did not reproduce.

## Phase 6 — Real-time

Slice 1 (Socket.IO connection, handshake auth, org room) shipped:

- [x] New `apps/api/src/realtime/socket-server.ts` — `attachSocketServer(httpServer)`,
      a pure function of the server it's given (not a side effect of
      importing the module), so `index.ts` and this slice's own test both
      call it and can never drift into two different auth
      implementations. `index.ts` now builds a real `http.Server`
      (`createServer(app)`) instead of discarding `app.listen()`'s return
      value, since Socket.IO needs to attach to it directly.
- [x] Handshake auth reuses `verifyAccessToken()` — the same function
      `requireAuth` already calls, already a plain function with nothing
      Express-specific about it. Rejection is Socket.IO's own mechanism
      (`next(new Error(...))`, the client gets `connect_error`), not
      `AppError` — its HTTP status/code/details shape has nothing to map
      onto a socket handshake. Every rejection (missing token, invalid
      token, and `join:org` for a non-member) is logged server-side with
      structured `logger.warn` — **found live while verifying this
      slice**: the handshake-rejection path was originally silent
      server-side (only `join:org`'s rejection logged anything), an
      observability gap next to every other rejection path in this
      codebase; fixed before considering the slice done.
- [x] `join:org` is a client-emitted event with an acknowledgement
      callback, not automatic on connect. The handler re-runs the exact
      membership check `requireOrgMembership` does
      (`organizationsRepository.findMembership`) before calling
      `socket.join()` — the client-claimed org id is never trusted on
      its own, same defense-in-depth as every HTTP middleware here.
- [x] Reconnection re-authenticates with whatever token is current, not
      one captured at first connect: `socket.io-client`'s `auth` option
      is a function (`apps/web/src/shared/socket/socket-client.ts`),
      called fresh on every (re)connection attempt, reading whatever
      `token-store.ts` currently holds. `join:org` re-fires on every
      `connect` event too, since Socket.IO room membership doesn't
      survive a new underlying connection. **Verified live, not just
      assumed**: logged in, killed the API dev server outright while the
      browser tab stayed open, confirmed the client's own reconnect
      attempts (and their failures) logged live, restarted the API, and
      watched the client reconnect and re-join its org room automatically
      within seconds — no page reload, no new code beyond the reconnect-
      safe `auth` function and the existing `connect` handler.
- [x] `AuthContext.tsx`'s `login()`/`logout()` call `connectSocket()`/
      `disconnectSocket()` — the same lifecycle the access token itself
      already follows, not a new one.
- [x] Vite dev proxy gets a `/socket.io` entry with `ws: true` (off by
      default for a plain proxy entry) alongside the existing `/api`
      one, keeping "the browser only ever talks to one origin" true for
      sockets too.
- [x] New `socket-server.test.ts` — a real `http.Server` on an ephemeral
      port, the same `attachSocketServer()` production wiring uses, a
      real `socket.io-client` connection: valid token + real membership
      connects and `join:org` acks; missing/invalid token is rejected at
      handshake; valid token but no membership in the claimed org acks
      `{ ok: false }`.
- [x] **A real lockfile bug found and fixed while installing
      dependencies for this slice**: `pnpm-lock.yaml` had an incomplete,
      dangling resolution for `socket.io-client@4.8.4` (declared in the
      packages section with no matching dependency snapshot, left over
      from adding the package separately in two workspace directories),
      which left `apps/web/node_modules/socket.io-client` a broken
      symlink — `pnpm install`, `--force`, and `pnpm dedupe` all left it
      unfixed; only deleting and regenerating the lockfile from the
      package.json specs resolved it cleanly. Confirmed via
      `pnpm typecheck` succeeding afterward, not just the symlink
      existing.

No real-time *feature* yet — this slice is the walking skeleton
(mirrors Phase 1's role for the whole app) proving an authenticated,
tenant-scoped connection works end to end before slices 2-4 build on it.

Slice 2 (broadcast after commit + live board updates) shipped:

- [x] `createIssue`/`updateIssue`/`moveIssue` in `issues.service.ts` —
      until now a pure pass-through to the repository, as anticipated
      since Phase 3 slice 1 — now call the new `broadcastIssueChanged
      (projectId, issueId)` after the repository call resolves, and only
      on a real success (`update`/`move` check the repository's own
      `status` first; a conflict/not_found never actually changed
      anything worth broadcasting).
- [x] `broadcastIssueChanged` lives in `realtime/socket-server.ts`,
      backed by a module-level `ioInstance` singleton set inside
      `attachSocketServer()` (same pattern `db/client.ts` already uses)
      — **silently no-ops if no socket server was ever attached**,
      which is correct behavior for every HTTP-level test in this
      codebase (they drive `app` directly via supertest, no real
      `http.Server`, no sockets), not a workaround. Verified by the full
      existing test suite staying green untouched.
- [x] New `join:project`/`leave:project` socket events — same shape as
      slice 1's `join:org`: re-verifies the project actually belongs to
      an org the caller is a member of
      (`projectsRepository.findById`, the same check `requireProject`
      does over HTTP) before joining the room. Needed `socket.data` to
      also remember `organizationId` (set once, on a successful
      `join:org`) — the socket-side equivalent of
      `req.ctx.organizationId`.
- [x] New `apps/api/src/realtime/broadcast.test.ts` — a real `http.Server`
      wrapping the real `app` (not a bare server), driven by both
      `supertest` for genuine HTTP mutations and a real `socket.io-client`
      asserting `issue:changed` actually arrives in the right
      `project:{id}` room (and never in one the socket didn't join).
- [x] New `entities/issue/api/useLiveIssueUpdates.ts`, called from
      `ProjectBoardPage` and `ProjectDetailPage`: joins `project:{id}`
      on mount, leaves on unmount, invalidates `issueKeys.board`/`list`
      on `issue:changed`.
- [x] **A real race condition found and fixed via live testing, not
      assumed away** — twice. A fresh page load calls `connectSocket()`
      (which joins `org:{id}`) and mounts `useLiveIssueUpdates` (which
      joins `project:{id}`) almost simultaneously; the project join
      could reach the server and get rejected (`not_in_org`) before the
      org join's own ack had actually set `socket.data.organizationId`
      server-side — caught live with two real browser tabs, not
      predicted from reading the code. First fix attempt (reset a
      shared "org ready" promise inside the `connect` handler) still
      left the exact same gap open *before* the first `connect` event
      fired. Real fix: `whenOrgRoomReady()` in
      `shared/socket/socket-client.ts` is a promise reset **synchronously
      inside `connectSocket()` itself** (no gap before the first
      connect) and again on every `disconnect` (room membership is gone
      the instant a connection drops, not just "eventually" on the next
      reconnect) — anything that depends on the org room must await it,
      not just check `socket?.connected`.
- [x] Verified live end to end with two real browser sessions on the
      same project: a drag on one tab updated the other's board with no
      reload; creating an issue on one tab's list page appeared live on
      the other's board; and — the harder case — killing and restarting
      the dev API server while a tab stayed open confirmed it
      reconnected and rejoined **both** rooms automatically (server logs
      showing `join:org` then `join:project` in the correct order), with
      a real subsequent drag still broadcasting correctly afterward, not
      just the underlying connection coming back.
Slice 3 (live comments — `issue:{id}` room) shipped:

- [x] `broadcastIssueChanged(projectId, issueId)` now targets both
      `project:{id}` and `issue:{id}` in one emit (Socket.IO's chained
      `.to()` unions the rooms — a socket in both gets one copy, not
      two) — a field change from anywhere (the board, an edit) now also
      reaches anyone reading that exact issue's detail page, not just
      the board/list. No call site changed; `createIssue`/`updateIssue`/
      `moveIssue` already called it with both ids.
- [x] New `broadcastIssueCommented(issueId)` — a distinct event
      (`issue:commented`), only into `issue:{id}`: comments never render
      on the board/list, so project-room viewers have no reason to hear
      about them. `issues.service.ts`'s `addComment` calls it after the
      repository call resolves, same "after commit, only on real
      success" shape as the other three call sites.
- [x] New `join:issue`/`leave:issue` socket events, same verification
      shape as `join:project`: the client sends `{ projectId, issueId }`
      (both already in the URL), the server checks
      `socket.data.organizationId` then reuses the exact
      `issuesRepository.findById` check `requireIssue` runs over HTTP —
      never trusting the client-claimed ids alone.
- [x] New `entities/issue/api/useLiveIssueDetailUpdates.ts`, called from
      `IssueDetailPage`: joins `issue:{id}` on mount, leaves on unmount,
      invalidates `issueKeys.detail`/`events` on either `issue:changed`
      or `issue:commented`.
- [x] **A deeper version of slice 2's race condition, found live again**:
      slice 2's fix (a single Promise instance, reset on `connect`/
      `disconnect`) still had the same underlying flaw one level down —
      a caller that already attached `.then()` to the *old* pending
      promise is never woken once that promise is silently swapped for
      a new one, since reassigning the module variable doesn't reach an
      already-issued reference. React StrictMode's dev-only rapid
      connect/disconnect churn on a fresh page load made this the
      *common* case for `join:issue`, not a rare edge case — proven by
      a direct, hook-free manual `join:issue` call (no intervening
      disconnect) succeeding every time while the app's own hook
      silently never joined. Root-caused by counting `"joined issue
      room"` log lines across a full run (zero from the app, one from
      the manual test), not guessed at. Real fix: `whenOrgRoomReady()`
      in `shared/socket/socket-client.ts` is now a resolver *queue*
      against a plain boolean flag, not a single swapped `Promise` —
      correct no matter how many connect/disconnect cycles happen
      between a caller asking and readiness actually being achieved.
- [x] Verified live end to end with two real browser sessions on the
      same issue's detail page: a comment posted on one appeared live
      on the other with no reload; separately, dragging that issue's
      card on the board (a different tab) live-updated the detail
      page's status badge *and* timeline, proving the dual-room
      broadcast; and killing/restarting the dev API server with a
      detail page open confirmed it reconnected and rejoined **both**
      `org:{id}` and `issue:{id}` automatically, with a subsequent
      comment still broadcasting correctly afterward.
Slice 4 (presence on an issue — last slice in this phase) shipped:

- [x] A genuinely different shape from slices 1-3: ephemeral, in-memory
      only — `Map<issueId, Map<socketId, {userId, name}>>` in
      `realtime/socket-server.ts`, no DB table, no `issue_events` row.
      Keyed by `socketId`, not `userId`, so two tabs from the same
      person are tracked independently (closing one correctly leaves
      the other's presence intact); the broadcast payload dedupes by
      `userId` so they still show as one entry, not "Alice, Alice".
- [x] `SocketData` gains a lazily-cached `name`, fetched once (reusing
      `auth.repository.ts`'s existing `findUserById`) the first time a
      socket actually joins an issue room — not in the connection-wide
      auth middleware, which would cost every board-only session a DB
      read it never needed.
- [x] Presence tracking rides on the existing `join:issue`/
      `leave:issue` handlers (slice 3), not new join events — joining
      adds the viewer and broadcasts `presence:update`; `leave:issue`
      and a real `disconnect` both remove it and broadcast again.
      `disconnect` scans every currently-tracked issue (no per-socket
      reverse index — not worth it at this app's real scale).
- [x] `useLiveIssueDetailUpdates` (already owning the `issue:{id}` join/
      leave lifecycle since slice 3) gained a return value instead of a
      new sibling hook — presence is one more kind of data arriving on
      a room this hook already manages.
- [x] **Verified live with a genuinely different second user**, not
      just two tabs of the same account — this app has no invite flow
      yet (every registration creates its own personal org), so a real
      second member of the same org was seeded directly (mirroring
      `socket-server.test.ts`'s own seeding pattern) and driven through
      a real `socket.io-client` connection with a real
      `signAccessToken()`-issued token. Confirmed the actual rendered
      page — not a simulated event — showed "Presence Viewer is also
      viewing" the moment that connection joined, and confirmed the
      line disappeared the instant a real `.disconnect()` call fired
      (not just a clean unmount/`leave:issue`), proving the
      disconnect-triggered cleanup path specifically. Also confirmed
      two tabs of the *same* account correctly show no presence line
      (dedup working as designed), and that navigating between two
      different issues leaves no stale presence flash.

**Phase 6 is now fully complete.**

## Phase 7 — Search, notifications, uploads

Slice 1 (Postgres full-text search: `tsvector` column, GIN index, ranking) shipped:

- [x] New generated `search_vector` column on `issues`
      (`GENERATED ALWAYS AS (...) STORED`), built through Drizzle's
      `customType<{ data: string }>({ dataType: () => "tsvector" })` —
      pg-core has no first-class `tsvector` type (confirmed by listing
      every file under `pg-core/columns/`), same "round-tripped as an
      opaque string, never parsed" precedent as `board_rank` (ADR 0007).
      Weighted `setweight(to_tsvector('english', coalesce(title, '')),
      'A') || setweight(to_tsvector('english', coalesce(description,
      '')), 'B')` — title outranks description in `ts_rank`.
- [x] New GIN index (`index(...).using("gin", ...)`) — the only index
      type that can serve a `tsvector @@ tsquery` match.
- [x] **Unlike `board_rank`, this needed no hand-written migration**:
      `board_rank`'s two-step migration (ADR 0007) existed only because
      of a `NOT NULL` backfill problem; a `GENERATED ALWAYS AS (...)
      STORED` column self-populates for every existing row the instant
      it's added. Verified, not just assumed — read `drizzle-kit
      generate`'s actual SQL output (matched the intended DDL exactly,
      zero hand-editing) and confirmed via direct `psql` inspection that
      existing rows self-populated with correct `'A'`/`'B'` weighting
      and real English stemming (e.g. "Issue" → `issu`, "Test" →
      `test`).
- [x] New org-scoped `search(organizationId, query, limit)` in
      `issues.repository.ts` — raw `sql` for both the `@@` match
      (`websearch_to_tsquery`, not `plainto_tsquery`, so quoted phrases
      and `-exclude` parse the way a real search box is typed) and the
      `ts_rank`-based `ORDER BY`, since Drizzle has no first-class
      full-text-search operator. New `GET
      /organizations/:organizationId/search?q=` (not nested under a
      project — a future command palette needs to search the whole org),
      reusing the same `view_issue` permission `listIssues` already
      requires. Fixed 25-result cap, no pagination — a relevance-ranked
      result set degrades fast past page one. `ts_rank`'s score never
      reaches the client, same `board_rank`-never-leaves-the-server
      precedent — `searchIssuesResponseSchema` reuses `issueSchema`
      as-is and `.parse()` strips it.
- [x] New `SearchPage` (`/search`, linked from `ProjectsPage`'s header)
      — `?q=` is the URL's source of truth, same convention
      `ProjectDetailPage`'s `?status=`/`?order=` already established.
      Results span every project in the org, so `IssueCard`'s
      `projectKey` is resolved per-result from the already-cached
      `useProjects()` list, same "no dedicated single-project fetch"
      pattern every other page uses.
- [x] Verified live end to end, not just via the automated repository
      test: created a title match and a separate description-only match
      for the same term and confirmed the title match ranked first in
      the real UI; confirmed a second, genuinely different organization
      never saw the first org's matching issue; confirmed a bookmarked
      `?q=...` URL reproduced the same results on a fresh full page load
      with zero prior interaction. Seeded 20,000 real rows via `psql`
      and ran `EXPLAIN ANALYZE` against the actual query — confirmed a
      `Bitmap Index Scan` on `issues_search_vector_idx`, not a
      sequential scan, then removed the seeded rows.

Slice 2 (command palette, ⌘K) shipped:

- [x] First real widget in the codebase — `widgets/command-palette/` had
      been empty since Phase 0. Mounted once in `App.tsx`, inside
      `BrowserRouter`, as a sibling of `ErrorBoundary`, so it survives
      every route change. Renders nothing while logged out (`useAuth()`
      has no `organization`).
- [x] Ctrl+K / Cmd+K globally toggles the palette (`preventDefault()` —
      Chrome/Edge otherwise bind Ctrl+K to the address bar search). No
      new dialog library: the native HTML `<dialog>` element gives a
      real top-layer overlay, `Escape`-to-close, and backdrop-click-to-
      close for free — Phase 3.5 deliberately skipped Radix, and one
      modal doesn't justify adding it now.
  - Reuses slice 1's search endpoint exactly as built via the existing
    `useSearch` hook — no backend or contract changes this slice.
    Input is debounced 250ms (`useDebouncedValue`, colocated, not
    `shared/lib` — no second consumer yet) before hitting `useSearch`.
  - Result rows are a dedicated `<button>`, not a reused `IssueCard` —
    the palette needs one selection model for both pointer clicks and
    arrow-key + Enter, which a real `<Link>` (IssueCard's own row)
    doesn't cover on its own.
  - Query and highlighted-row state reset on every close, whether that
    came from selecting a result, Escape, or a backdrop click (the
    dialog's own native `close` event) — reopening never shows a stale
    query.
- [x] **A real bug found and fixed via live testing, not assumed away**:
      the palette calls `useProjects()` unconditionally (hooks can't be
      called conditionally), passing an empty string for `organizationId`
      while logged out. `useProjects` had no `enabled` guard at all —
      every one of its five pre-existing callers renders inside
      `RequireAuth`, where `organizationId` is always real, so this had
      never mattered before. The palette is the first caller that can
      render pre-login, and the empty id fired a real request against
      `/organizations//projects` every few seconds (TanStack Query's
      background refetch), 404-ing in a loop — caught live via the
      browser console, not predicted from reading the code. Fixed by
      giving `useProjects` an optional `{ enabled }` param (defaults to
      `true`, so all five existing call sites are unaffected) and
      passing `enabled: !!organization` from the palette; confirmed live
      that the repeating 404 stopped and stayed stopped.
- [x] Verified live end to end, from more than one page: Ctrl+K opened
      the palette from both `/projects` and an issue detail page;
      typing returned the same ranked results `/search` itself returns
      for the same query (a title match still outranked a description-
      only match); clicking a result and a full keyboard-only pass
      (Ctrl+K, type, Arrow Down, Enter) both navigated to the right
      issue and closed the palette; reopening after a close always
      showed an empty query; and Ctrl+K while logged out did nothing —
      no dialog, and (after the fix above) no background request either.

Slice 3 (notifications derived from events; in-app feed + read state) shipped:

- [x] No assignee field exists on issues, so recipients are **event
      participants** — every distinct actor from an issue's past
      `issue_events` rows (the reporter is always in there via their own
      `issue.created` row), minus whoever just caused the new event.
      Confirmed with the owner before building — see the Phase 7 slice
      3 plan.
- [x] New `notifications` table (`{ id, userId, issueEventId, readAt,
      createdAt }`) — no `organizationId` column, joined through
      `issue_events → issues` for tenant scoping, same pattern
      `issue_events` itself already uses. New `notifications` module
      (its own table, its own mutation, its own recipient — unlike
      search, which stayed inside `issues` with no new state).
- [x] A new `writeIssueEvent()` helper in `issues.repository.ts`
      replaces all 7 previously-duplicated `tx.insert(issueEvents)`
      call sites (create, update, move, attachLabel, detachLabel,
      addComment, assignSprint) — inserts the event, then fans out one
      notification per participant in the same transaction via a single
      `INSERT ... SELECT DISTINCT ... WHERE actor_id != $current`.
      **Also reused by `sprints.repository.ts`'s `completeSprint()`**,
      which bulk-writes `issue.sprint_removed` events for every
      released issue — no carve-out for that bulk path, same "no
      carve-out" precedent `issue.moved`'s own audit event already set.
- [x] New `user:{userId}` Socket.IO room, auto-joined on connect (not a
      client-emitted `join:*` like org/project/issue — your own
      notifications are always wanted regardless of what page you're
      on). New `broadcastNotificationCreated(userId)`, called from
      `issues.service.ts`'s 7 mutating functions and
      `sprints.service.ts`'s `completeSprint`, strictly after each
      repository call resolves — never from inside the transaction,
      same rule Phase 6 slice 2 established for `broadcastIssueChanged`.
- [x] New endpoints: `GET .../notifications` (fixed 25-item cap, same
      deliberate scope cut as search's own cap), `GET
      .../notifications/unread-count` (a separate cheap indexed count,
      not derived from the capped list — which would silently
      undercount past 25 unread), `PATCH .../notifications/:id/read`,
      `PATCH .../notifications/read-all`. `requireOrgMembership` only,
      no `requirePermission` — these are always the caller's own data.
- [x] `describeEvent` (the "actor did X" sentence generator) moved out
      of `IssueDetailPage.tsx` into `entities/issue/lib/` — the
      notification feed is a second real consumer needing the same
      sentences for issues the viewer isn't currently looking at.
- [x] New `entities/notification` + `widgets/notification-bell` — a
      fixed-position bell (no persistent nav shell yet, same honest-
      placeholder reasoning as the command palette), a non-modal
      dropdown (not `<dialog>` — a notification panel shouldn't block
      the page the way the palette's modal search should), read-on-
      click-through plus an explicit "Mark all read", and
      `useLiveNotifications` invalidating on a live `notification:created`
      push.
- [x] **A real bug found and fixed live, the same class as slice 2's**:
      `useNotifications`/`useUnreadCount` fired with an empty
      `organizationId` while logged out (`NotificationBell` is mounted
      globally, the first two callers of these particular hooks that
      can render pre-login) — caught via the browser console
      (`/organizations//notifications` 404-looping), fixed with an
      `enabled: organizationId !== ""` guard on both.
- [x] Verified live end to end with a real second org member (seeded
      directly + added to the org's membership table, then driven via
      real authenticated HTTP requests — this app still has no invite
      flow): a comment from that second user updated the first user's
      bell badge and panel **live**, with no reload, from more than one
      page; clicking a notification navigated to the right issue and
      cleared it; "Mark all read" cleared the rest; the commenter's own
      unread count stayed at zero (no self-notification, confirmed
      against the real running system, not just the automated test);
      and killing/restarting the API dev server with a tab open
      confirmed it reconnected, rejoined `user:{id}` automatically, and
      a subsequent comment still delivered live afterward.

Slice 4 (file attachments: validation, storage, signed URLs) shipped:

- [x] "Signed URLs" usually implies real S3, but CLAUDE.md's stack list
      puts S3-compatible storage and Docker under Later (Phase 9).
      Confirmed with the owner: local disk + our own HMAC-signed,
      time-limited download tokens — the real signed-URL *concept*
      (tamper-proof, time-boxed access, no cookie/JWT) without pulling
      Phase 9's infra forward. New `lib/storage.ts` (`saveFile`/
      `deleteFile`/`readFileStream` + `signDownloadToken`/
      `verifyDownloadToken`, HMAC-SHA256 over `attachmentId:expires`,
      constant-time comparison via `timingSafeEqual`, 5-minute TTL) is
      the seam real S3 would swap in behind. New required
      `ATTACHMENT_SIGNING_SECRET` (`min(32)`, validated at boot) and
      `UPLOADS_DIR` env vars.
- [x] New `attachments` table, kept inside the `issues` module (a
      sub-resource like labels/comments, no recipient/read-state of its
      own — unlike notifications). Flat `{attachmentId}` filenames on
      disk; the original filename is untrusted input and never used in a
      path. `multer` 2.x (memory storage) parses uploads; its
      `fileFilter`/`limits` plus a small wrapper turn every rejection
      into a real `AppError` (`file_too_large`, `unsupported_file_type`),
      never a raw 500. Allowed types and the 10MB cap live in
      `packages/contracts` so the upload form pre-validates against the
      exact rule the server enforces. **Named limitation, not a silent
      gap**: the MIME type is client-supplied, not sniffed from bytes.
- [x] `GET .../attachments` mints a fresh `downloadUrl` per row (no
      separate "mint" endpoint). The download route itself
      (`GET /api/v1/attachments/:id/download?expires=&sig=`) is
      deliberately unauthenticated and token-gated — the signature *is*
      the authorization, same trust model as a real presigned URL.
- [x] Upload/delete go through the existing `writeIssueEvent` choke
      point (`issue.attachment_added`/`_removed`), so participants are
      notified with zero new wiring — the payoff of slice 3's helper.
- [x] **Real bugs found and fixed while building/verifying**, not
      assumed away: (1) the upload response was missing `uploaderName`
      (a plain `INSERT ... RETURNING` can't join `users`) — caught by
      the HTTP round-trip test as a 500, fixed with one in-transaction
      lookup. (2) **A slice 3 bug that only a page reload exposes**:
      `connectSocket()` replaced the socket on every call, and React
      StrictMode runs the auth refresh twice on reload, so the
      always-mounted `NotificationBell`'s `notification:created`
      listener ended up on a discarded socket instance and live pushes
      silently stopped (the badge was right after a refresh, wrong
      until then). Slice 3's live test logged in through the form,
      which calls it only once, so it never saw this. Fixed by making
      `connectSocket()` idempotent for an already-active connection to
      the same org; re-verified on the exact failing path (full reload,
      then another member's upload moved the badge 2 → 3 live).
- [x] Frontend: `apiUpload`/`apiDeleteVoid` in the shared client,
      `useAttachments`/`useDeleteAttachment` + `AttachmentList` in
      `entities/issue`, a new `features/upload-attachment`, mounted in
      `IssueDetailPage`. Plain list with a real `<a href>` download
      link (no inline previews); anyone with `manage_issue` can delete
      (role-based, not ownership-based, like labels/comments).
- [x] Verified: 18 files / 158 tests (new: signed-token sign/verify
      including a genuinely-valid-signature-but-expired case against an
      independent HMAC reimplementation, repository tests with
      notification fan-out, and an HTTP round trip through `supertest`
      `.attach()` proving the bytes survive). Live: a real upload
      appeared in the list and timeline; the signed URL returned the
      exact bytes with `Content-Disposition: inline`; a tampered
      signature and an expired timestamp both got 403; a disallowed
      type and an oversized file were rejected client-side *and*
      server-side (400, not 500); deleting removed the DB row, the
      physical file, and wrote the removal event. Not verified: a real
      browser file-chooser upload — Chrome refused the injected chooser
      ("Not allowed"), so the file was set on the input via
      `DataTransfer`, which drives the app's real `onChange` and upload
      code but is not a native picker.
- Known limits, named on purpose: no live cross-tab sync of the
  attachment *list* (only notifications push live); no inline image
  preview; local disk only until Phase 9.

**Phase 7 is now fully complete.**

## Phase 8 — Analytics

Planned as 5 slices: (1) foundations + throughput, (2) cycle time,
(3) sprint velocity, (4) breakdowns, (5) dashboard assembly + performance
(`EXPLAIN ANALYZE` at volume, date-range in the URL).

Slice 1 (foundations + throughput) shipped:

- [x] New ADR 0009: analytics are computed **on read from `issue_events`**
      (no rollup tables), transitions come from **replaying each issue's
      events in order** (`LAG`, default `todo`), "completed" = a real
      transition into `done` (reopened-then-redone counts again), UTC
      Monday weeks, issues counted not points, per project with the
      existing `view_issue` permission.
- [x] New `analytics` module (own module: a growing set of read-only
      cross-table queries), `GET .../projects/:projectId/analytics/
      throughput?weeks=` (default 12, max 52, zero-filled). The reason for
      the replay: `issue.updated` carries `status` even when it didn't
      change (the edit form resends it), so trusting the payload would
      invent completions.
- [x] Proved, not assumed: the two "trap" tests (unchanged-status edit,
      same-column reorder) were confirmed to **fail** when the
      previous-status check is removed, then restored. An independent
      plain-JS replay over the 100 seeded issues matched the SQL for all
      12 weeks (67 completions, 0 mismatches).
- [x] Seed: an idempotent "Analytics Demo" project (deterministic PRNG,
      100 issues, 234 backdated events incl. reopens and unchanged-status
      edits); `SEED_ORG_SLUG` seeds it into an existing org.
- [x] Frontend: Recharts on new semantic tokens `--color-chart-primary/
      -grid/-axis` (light + dark redefinitions), `entities/analytics`,
      `widgets/throughput-chart` (thin rounded bars, no legend for one
      series, text summary + "View as table", empty state), page at
      `/projects/:id/analytics`, linked from the project page.
- [x] Verified live (token-lean: `find`/`evaluate`, devtools closed): 11
      bars for 12 weeks (the zero week draws no bar; the table lists all
      12) and table values equal the verified numbers; bar contrast vs the
      surface 4.18:1 light / 6.89:1 dark (≥3:1 needed), grid deliberately
      ~1.2:1; colors change with `data-theme`; a project with no
      completions shows the empty state.
- **Not verified:** tooltip on real *mouse* hover — in this automated
  browser Recharts never reacted to pointer moves (it did receive them).
  The tooltip component itself is verified through keyboard focus (renders
  "Week of Jul 13 · 4 issues completed"). Worth one manual hover.
- Observed, not fixed (out of scope): a full reload right after login can
  bounce to `/login` (refresh-token rotation), as noted since slice 1.

Slice 2 (cycle time) shipped:

- [x] ADR 0010: cycle time = **first entry into in_progress -> first
      completion at or after it**, one value per issue. First entry so a
      bounce back doesn't reset the clock; first completion so a
      reopened issue isn't two cycles (that is throughput's job). Issues
      finished without ever being in progress have no cycle time and are
      reported as `withoutStart`, not hidden. Reported as median (leads),
      mean, p90 plus six fixed buckets (inclusive lower bound).
- [x] `GET .../analytics/cycle-time?weeks=`. The replay CTE from slice 1 is
      now one shared fragment used by both metrics, so they cannot
      disagree about what a transition is. The `?weeks=` schema was
      renamed `weeksQuerySchema` now that two endpoints share it.
- [x] Proved, not assumed: mutation checks — using MAX instead of MIN for
      the start fails 2 tests; dropping "completion must be at/after the
      start" fails the skip-then-reopen test with the exact bug it guards
      (a **-4 day** span). An independent plain-JS replay of the seeded
      project matched the SQL: 37 finished, median 3.5 / mean 3.4 / p90
      5.8 days, 27 withoutStart, identical bucket counts (4,12,20,1,0,0).
- [x] Frontend: `CycleTimeChart` (stat row led by the median, histogram on
      the same chart tokens, text summary + table view, empty state that
      explains the no-start case). Live: values equal the verified
      numbers, six labels, 4 bars for 4 non-empty buckets, light/dark bar
      colors differ, tooltip via keyboard, empty project shows the message.
- Still unverified, as in slice 1: the tooltip under a real mouse hover.
- Observation (seed, not a bug): 27 of 64 seeded finishes skip in-progress
  by design (40%), so the demo shows a large withoutStart.

Slice 3 (sprint velocity) shipped:

- [x] The open decision from the plan dissolved on reading the code:
      `complete()` already writes one `issue.sprint_removed` event per
      issue in the sprint, tagged `{ sprintId, reason: "sprint_completed" }`,
      in the same transaction and for every status. Those events **are** a
      snapshot of the sprint's membership at close, so no snapshot column, no
      membership replay, no ADR 0008 change, and it works retroactively.
      ADR 0011 records this.
- [x] `GET .../analytics/velocity?sprints=` (default 8, max 20): per
      completed sprint, `committed` (members at close) and `completed`
      (done **as of the close**, from the issue's own status events at or
      before its release event). Finishing an issue after the close does not
      credit the sprint; reopening it later does not remove the credit.
      Headline is the mean completed, computed in the service. A completed
      sprint with no issues shows 0 / 0.
- [x] Tests drive the **real** sprint and issue repositories so the events
      are the ones production writes (10 repository + 2 HTTP tests).
- [x] Caught a weak test by running the mutation checks: my first
      "status as of the close" test combined a late finish and a late reopen,
      which cancel to the same total, so a query using the status *now* still
      passed. Split into two tests; the "status now" break now fails 3 tests.
      A second break (dropping the `reason = sprint_completed` filter) passed
      at first because today a manual removal records `sprintId: null` and
      can never match a sprint; added a test with a manual removal that
      *does* name the sprint, so the filter is pinned. Both breaks now fail.
- [x] Seed: `seedSprintHistory` (six completed two-week sprints, assign +
      close-time release events mirroring the real code, done-ness decided
      from each issue's own events so some issues truly carry over). Runs
      when a project has no sprints, so it also upgrades orgs seeded earlier;
      re-running is a no-op.
- [x] Independent plain-JS replay of the seeded project matched the SQL
      for all six sprints: 0/0, 5/6, 6/11, 8/9, 6/10, 7/16 (average
      completed 5.3).
- [x] Frontend: `VelocityChart` (stats: average, latest, carried over;
      single-series bars; tooltip + table with completed / committed /
      carried over; empty state). Live: values equal the verified numbers,
      keyboard tooltip, table rows, light/dark bar colors differ, project
      with no sprints shows the empty message.
- Still unverified, as in slices 1-2: the tooltip under a real mouse hover.

Slice 4 (breakdowns) shipped:

- [x] ADR 0012: breakdowns are a snapshot of **current state**, so they read
      the `issues` / `issue_labels` tables directly. The rule this fixes in
      place: history (throughput, cycle time, velocity) comes from
      `issue_events`; the present comes from the tables. Plain Drizzle
      group-by queries, no raw SQL.
- [x] `GET .../analytics/breakdown`: issues per status (always three, in
      workflow order, zero-filled) and **open** issues per label (top 10 by
      count, ties by name). An issue with two labels counts under both, so
      label counts are not additive; the UI says so. Two gaps are reported,
      not hidden: `unlabeled` open issues and `hiddenLabels` past the top 10.
      Both tables are tenant-scoped (labels are org-level, so the label's org
      is filtered too, not just the issue's).
- [x] Mutation checks found real test gaps, fixed before shipping: dropping
      the project filter from the *unlabeled* query passed at first (my
      isolation test had no unlabeled issue elsewhere to leak), and removing
      the label-organization guard passed because normal code can never
      attach a foreign label. Added an unlabeled-elsewhere case and a test
      that inserts a bad cross-tenant row by hand. All five breaks now fail
      the matching test.
- [x] Seed: `seedLabels` (five labels, a deterministic ~65% of issues
      labelled, some with two), idempotent, runs on both the fresh and the
      upgrade path. Rows only, no label events (a seed shortcut).
- [x] Independent plain-JS tally matched the endpoint exactly: 100 issues,
      37 open; todo 24 / in progress 13 / done 63; bug 16, feature 7, docs 5,
      design 2; 14 unlabeled. The label counts sum to 30 over 23 labelled open
      issues, which is the non-additive rule visible in real data.
- [x] Frontend: `BreakdownCharts` (status columns, horizontal label bars, one
      chart color for both, text summaries, tables, notes for the gaps, empty
      states). Live: numbers match, keyboard tooltips, table rows, light/dark
      bar colors differ, project with no issues shows the empty message.
- Still unverified, as in slices 1-3: the tooltip under a real mouse hover.

- [x] Slice 5 — dashboard assembly, date range in the URL, query
      performance at volume
  - `?weeks=` (4/12/26/52, default 12) drives throughput and cycle time;
    `?sprints=` (4/8/12, default 8) drives velocity. Defaults are kept out
    of the URL; unknown values fall back to the default. Breakdowns are a
    snapshot, so no range. Layout: throughput full width, cycle time and
    velocity side by side from `lg`, breakdowns full width.
  - Performance, measured on a throwaway project (20,000 issues, 43,600
    events, 12 sprints, median of 7 runs after a warm-up), budget ~100 ms:
    | endpoint | before | after |
    |---|---|---|
    | throughput (12 / 52 wk) | 36.7 / 35.6 ms | 34.2 / 33.8 ms (unchanged) |
    | cycle time (12 / 52 wk) | 128.9 / 125.9 ms | 75.8 / 73.6 ms |
    | velocity (12 sprints) | 3871 ms | 18.7 ms |
    | breakdown | 17.4 ms | 18.0 ms (unchanged) |
  - Finding: Postgres materializes a CTE referenced more than once, and
    velocity's per-release correlated subquery then did a `CTE Scan` per
    row (`loops=3600`). The second reference came from an unused
    `transitions` CTE in the shared fragment. Fix: `status_events` is
    `NOT MATERIALIZED`, velocity no longer includes `transitions`, and
    cycle time is one query (FILTER bucket counts) instead of two replays.
    No index or schema change was needed, so no new ADR.
  - Throwaway data deleted; dev DB back to 212 issues / 731 events.
  - Verified live: `?weeks=52` and `?sprints=4` set the URL and selects,
    choosing the default removed the param, `?weeks=999&sprints=0` fell
    back to 12 / 8 with a working page, 52 weeks renders (26 x-axis ticks,
    zero weeks draw no bar).
  - Also verified live (throwaway QA account seeded via `SEED_ORG_SLUG`):
    a full page load of `?weeks=26&sprints=12` kept both selects and
    charts; 1400px light shows throughput full width with cycle time and
    velocity side by side; a fresh 420px dark render is one column with no
    horizontal scroll (all charts 309px wide).
  - Found and fixed afterward: at 420px the cycle-time bucket labels and
    velocity sprint labels overlapped. New `WrappingTick` in `shared/ui`
    splits a label at its last space when a category gets under 80px (so
    "1-3 days" becomes "1-3" over "days"); wide charts keep one line. The
    two axes are 40px tall to fit two lines. Checked at 420px: no overlap.
  - Retracted: "charts don't shrink on a live window resize" was a test
    artifact. The automated browser tab reports `document.hidden: true`, so
    it paints no frames and Recharts' ResizeObserver never fires until a
    screenshot forces one; after that the charts resized correctly both
    ways. Not an app bug.
  - Follow-up after the owner's real-mouse test: the first fix pinned every
    tooltip to one corner, which was not what the owner meant. Tooltips are
    now anchored per bar: above the hovered column (centered, above the plot
    so it never covers a bar) and, for the label chart, at the right edge of
    the hovered row. `AnchoredTooltip` + `anchoredTooltipProps` in
    `shared/ui`; animation off (Recharts eased it over 400 ms, the "slow
    follow"). Checked with real mouse moves on all five charts: the tooltip
    centre matched the hovered column/row within 1 px. It can overlap the
    stat row above a chart while hovering; accepted as transient.
  - Sprint selector now offers only choices that change something: with 6
    completed sprints it shows 4 and 8 (12 is hidden), and is hidden
    entirely with 4 or fewer. A stale `?sprints=` snaps to the nearest
    offered choice.
  - Real-mouse hover is now verified (it was keyboard-only in slices 1-4).

## Phase 8.5 — Collaboration polish (proposed 2026-09-30, before Phase 9)

Why: after Phase 8 and the design rollout, the owner asked what the product still
lacks. This phase is the answer, kept small on purpose: things a real team would
hit in the first day. Everything below was checked against the code; "confirmed"
means the schema or routes were read, not assumed. Each slice follows the working
agreement (plan first, tests with the slice, ADR if a decision changes).

**Confirmed gaps** (from the code, 2026-09-30):
- Comments can be posted and listed, but not edited or deleted (no route; the
  `comments` table already has `updated_at`).
- Attachments belong to an issue only (`issue_id`, no comment link).
- Issues have no assignee, priority or due date; issues, projects and labels
  cannot be renamed or deleted after creation (projects and labels only have
  create and list routes).
- No way to add teammates (no invite flow), so an organization is one person.
- The activity timeline has no times, although every event has `created_at`.
- Ctrl+K works but nothing in the UI mentions it; a wrong issue link shows a
  skeleton for about 7 seconds (failed request retried) before "not found".

### Slice 1 — Comments: edit, delete, files — DONE 2026-09-30 (ADR 0019)

**Built as decided with the owner:** files stay when a comment is deleted; post the
comment, then upload its files; edits and deletes notify nobody; the author edits,
the author or an owner/admin deletes. History stays append-only (new
`issue.comment_edited` / `issue.comment_deleted` events; the API folds them into the
comment). New migration 0015 (`attachments.comment_id`, `ON DELETE SET NULL`).
**Verified:** typecheck, lint and the full suite pass (215 tests, 10 new in
`comments.http.test.ts`). Mutation checks: dropping the edit author check, the
`notify: false` option, the joined-row fold, or the admin-delete rule each fails a
named test. **Live (Chrome, real clicks, QA account plus a second member driven
through authenticated requests):** a comment with two files showed them inside the
comment and in Attachments marked "from a comment"; edit showed "(edited)"; the
second member's comment, edit and the owner's delete all appeared without a reload
in the open tab; 403 for editing or deleting someone else's comment as a plain
member; deleting left both files in Attachments as plain files; a server-rejected
file (type swapped in the browser) left the comment posted with a message naming
the file; the bell did not change on edit; relative times ("1 minute ago"); dark
and light; 390px width. **Not verified:** a direct upload never appearing inside a
comment was checked by the API test only, not in the browser; a real native file
chooser (files were set through `DataTransfer`); the second member's own browser
view (only API calls); the tooltip with exact date on hover. **Noted, not
investigated:** a full page reload in the Playwright browser returned 401 from
`/auth/refresh` and sent the session to the login page; this slice does not touch
auth, cause unknown.

The original plan for this slice, kept for the record:

- **Edit and delete comments.** Activity history is append-only, so no row is
  changed: an edit writes an `issue.comment_edited` event and the UI shows the
  newest text with "(edited)"; a delete writes `issue.comment_deleted` and the UI
  hides the text while the history keeps the fact. Author edits; author or an
  admin deletes. Optimistic concurrency and tenant scoping as everywhere else.
- **Files in comments, one direction only.** Add a nullable `comment_id` to
  `attachments`. A comment's files also appear in the issue's Attachments list
  (marked "from a comment"); a file uploaded straight to the issue has no
  `comment_id` and never appears in any comment. Existing limits apply (allowed
  types, 10 MB, signed download URLs).
- **Times on the timeline and comments** ("2h ago", full date on hover), tiny
  and needed by "(edited)".
- **Decisions to confirm before building:**
  - When a comment is deleted, its files STAY in Attachments (recommended: a
    delete should not silently destroy uploads) or go with it?
  - Post the comment first, then upload the files, with a clear message if an
    upload fails (recommended) or one combined multipart request?
  - Do notifications fire for edits (recommended: no, only for new comments)?

### Later slices (order is a recommendation, not a commitment)

1. **Assignee and priority** on issues (cards, filters, "assigned to me"); also a
   better notification target than "everyone who took part". Probably the change
   that most alters how the product feels. **Split in two with the owner
   (2026-10-01): A = priority, B = assignee.**
   - **A, priority: DONE 2026-10-01.** `issues.priority` enum (`none` default,
     `low`, `medium`, `high`, `urgent`; migration 0016, no backfill needed: all 314
     dev issues became `none`). Set through the existing version-checked PATCH,
     `?priority=` list filter (also in the URL on the issues page), badge on every
     card (hidden for `none`, icon plus label, colour only for urgent and high),
     select in the edit form, badge on the detail page, activity line "changed
     priority to High". The edit form sends priority only when it changed.
     **Verified:** 6 API tests (default, set + event + version bump, stale version
     409, invalid value 400, filter incl. combination with status and bad value,
     board carries it), mutations on the filter and the contract refine fail them;
     e2e test (set, card, URL filter surviving a reload, one activity line), and
     its mutation (always sending priority) fails with 2 lines instead of 1.
     Full suites: 221 API tests, 8 e2e tests, lint and typecheck clean.
     **Not verified:** a long-lived board with many priorities visually (colours
     in dark mode were not looked at); sorting by priority is not built.
     **Edit-form activity noise: FIXED 2026-10-01.** `EditIssueForm` resends title,
     description and status on every save, so each save used to bump the version and
     write "changed the title / changed status / updated the description" for fields
     nobody touched. `update()` in `issues.repository.ts` now keeps only fields that
     really differ from the stored row (a `""` description equals a stored null);
     only those are written and logged; a save that changes nothing is a no-op (same
     version, no event, no notification) but still gets the version check, so a stale
     one is still a 409. **Verified:** 4 new API tests (one real change among resent
     fields; a real status change alone and still moving the card; a no-op with a
     participant present gets no version bump, event or notification; a stale no-op
     is a 409); four mutations (no filtering, `""` vs null, no-op still writing, no
     version check on the no-op) each fail named tests, and the first also fails an
     older board-rank test; the priority e2e test now also asserts no "changed the
     title" / "changed status" lines and fails without the filter. Suites: 235 API
     tests, 9 e2e. **Side effects to know:** older `issue.updated` events keep their
     noisy payloads (history is never rewritten); analytics already ignored an
     unchanged `status` in a payload (ADR 0009), so it is unaffected.
   - **B, assignee: DONE 2026-10-01 (ADR 0021).** `issues.assignee_id` (nullable
     FK, set null; migration 0017), set through the same version-checked PATCH
     (`assigneeId`, `null` unassigns), event carries the id plus a name snapshot.
     The service refuses anyone who is not a member of the issue's organization
     (`400 invalid_assignee`): no foreign key can express that. New
     `GET /organizations/:id/members` and a real `organizations` module; new
     `entities/member` and a `shared/ui` `Avatar` on cards (board, issues list,
     sprints, drag overlays, detail page), a select in the edit form, an
     assignee filter (Anyone / Unassigned / Assigned to me / each person, in the
     URL). Notifications: past participants PLUS the current assignee, minus the
     actor. **Verified:** 10 new API tests (members isolation both ways, assign,
     unassign, outsider refused and nothing changed, filter by person and
     unassigned, three notification cases); mutations: no membership check, assignee
     not a recipient, unassigned filter dropped, each fails named tests; e2e test
     with a second browser context (assign through the form, avatar on the card, the
     assignee's bell goes to 1 live with no reload, both filters, one activity
     line), 10 of 10 repeat runs, and the "assignee not a recipient" mutation fails
     it. Light and dark screenshots of the list and board looked right.
     **Not verified:** the board and sprint pages with assignees in the real drag
     interaction (cards only gained a prop); a very long member list in the select;
     mobile width for the new filter row. **Known gaps (in the ADR):** the previous
     assignee is not told they were unassigned unless they had acted; the avatar
     circle is only faintly lighter than the card in dark mode; no way yet to remove
     a member.
2. **Rename and delete** for issues, projects, labels and sprints, with
   confirmation. **Decided with the owner 2026-10-01 (ADR 0022), split in three:**
   - **3A, rename: DONE 2026-10-01.** (An issue title was already editable.)
     Project name (owner/admin; the KEY is immutable), label name and colour (any
     member who can manage issues; unique name, 409 on a clash), sprint name
     (version-checked, any status). New: `PATCH` routes and contracts, a project
     settings page (`/projects/:id/settings`, Settings link in the sidebar for
     owner/admin only, read-only for others), an organization-level Labels page
     (`/labels`, inline name and colour edit), inline Rename on sprint rows, and
     `useMyRole` (role from the members list, for showing or hiding controls only).
     **Verified:** 13 API tests (project: trim, key untouched even if sent, admin
     yes / member and viewer no, other org 403 and 404 with a borrowed org id, the
     repository query itself scoped by organization, bad names; label: member can
     rename and recolour, validation, duplicate name 409 and own name fine, viewer
     and other org refused, other org's id is a 404, old events keep the old name;
     sprint: planned and active, stale version 409, viewer 403, wrong project 404);
     mutations (no `manage_project`, label update unscoped, sprint rename without the
     version check, project update unscoped) all fail named tests, and the last one
     only after I added the direct repository test (the route middleware was hiding
     it); 3 e2e tests (project rename through the settings page and sidebar, key
     stays, a plain member has no Settings link and a read-only page; label rename
     and recolour with the real colour input, persisted, duplicate refused; sprint
     rename), 8 repeat runs each, 24 of 24; the "Settings link always shown"
     mutation fails the e2e test. Light/dark: dark screenshots of the labels page and
     settings page looked right. Suites: 235 + 13 API tests, 12 e2e tests.
     **Unexplained, seen once:** the older two-person live-comments e2e test failed
     once in a full run right after the API suite (11 of 12 passed); it then passed
     12 of 12 on its own and in two more full runs (12 of 12 each). The error text
     was not captured, so the cause is unknown. If it recurs, run the full suite
     with `--repeat-each` and read the first failure.
     **Found by the e2e test and fixed:** the settings page remounted its form when
     the project list refetched, so "Saved" appeared only sometimes (failed 4 of 6
     runs). **Also found:** an absence assertion (`toHaveCount(0)`) passes instantly
     on a page that has not rendered yet, so the member check first waits for the
     members request and the project links. **Not verified:** light mode and mobile
     width of the new pages; renames do not update other people's open tabs until
     they refetch; no event records who renamed what (no audit trail for renames).
   - **3B, delete issue, label, sprint: DONE 2026-10-01 (ADR 0022).** Hard delete.
     Issue: the reporter or an owner/admin (decided in the service against the real
     row); everything under it goes by cascade and its uploaded FILES are removed
     from disk; anyone viewing it is sent to the project list live, boards and lists
     drop it, and the bells of everyone who had notifications for it refetch. Label:
     owner/admin; leaves every issue, history keeps the name. Sprint: any member who
     can manage issues, refused with a 409 while active (the check is inside the
     DELETE statement); its issues return to the backlog. Inline confirmation
     everywhere (shared `ConfirmDelete`).
     **Verified:** 8 API tests (issue: cascade of comments, events, attachment rows,
     issue-labels and notifications, the uploaded file really gone from disk while a
     neighbour issue's file and the label stay; reporter/admin/owner yes, other
     member and viewer no; other org 403 and 404 and the repository query scoped on
     its own; label: admin yes with history kept, member/viewer/other org refused,
     bad id 400; sprint: planned and completed deleted with issues kept and
     un-sprinted, active 409, member yes, viewer no, wrong project 404); five
     mutations (files not removed, no reporter-or-admin rule, active sprint
     deletable, label delete open to members, issue query unscoped) each fail a
     named test; 3 e2e tests, 18 of 18 across repeats (issue: Cancel backs out,
     confirm deletes, the second viewer is redirected live, a non-reporter member is
     not offered the button; label: owner deletes, plain member offered no Delete;
     sprint: Delete disappears once started), and two mutations (no broadcast of the
     deletion; button always shown) fail the issue test. Light and dark
     screenshots of the confirmations looked right. Suites: 256 API tests, 15 e2e.
     **Not verified:** deleting an issue with a very large number of files; the
     files-removed path when the disk delete itself fails (it is logged, not
     tested); mobile width of the confirmations. **Polish noted:** on the Labels
     page the confirm text sits beside the Edit button, a little cramped.
     **Known gap:** the deleted issue's old URL shows a skeleton for about 7
     seconds before "not found" (the pre-existing item in the small-UI-wins list);
     the e2e test waits 15 s for it.
   - **3C, delete project: DONE 2026-10-01 (ADR 0022).** Owner/admin; the project's
     exact name must be typed in the UI AND is required by the API (`confirmName`,
     else `400 confirmation_mismatch`); everything under the project cascades, its
     files are removed from disk, and the whole organization is told (sidebars and
     lists drop it, anyone on one of its pages is sent to `/projects`, affected
     bells refetch). `apiDeleteVoid` can now carry a body.
     **Measured at 20,000 issues (test DB; 30,000 events, 5,000 comments, 9,062
     notifications): 8.96 s, 8.48 s of it in ONE cascade trigger** because
     `notifications.issue_event_id` had no index. **Migration 0018** adds it: 0.58 s
     (15x), 0.60 s through the real repository function. It also helps deleting a
     single issue on a big database. **Verified:** 4 new API tests plus an index guard
     (full cascade incl. sprints, comments, events, notifications, labels link, files
     really gone from disk, neighbouring project and its file untouched, label stays;
     wrong, missing and near-miss names refused with nothing deleted; admin yes,
     member and viewer no; other org 403, 404 with a borrowed org id, repository
     query scoped on its own); mutations (files not removed, name not required, name
     matched case-insensitively, delete open to members, repository unscoped, index
     dropped) each fail a named test; e2e test (button disabled until the exact name,
     Cancel resets, deleted for the owner and absent after a reload, a second person
     on a project page redirected live, a plain member never offered the control, a
     neighbouring project intact), 6 of 6 repeat runs, and two mutations (no
     broadcast; button enabled without the name) fail it. Dark and light screenshots
     looked right. Suites: 261 API tests, 16 e2e tests. **Not verified:** a project
     with a very large number of FILES (the 20,000-issue test had none); the
     request's total time over HTTP at that size (only the database work was timed);
     mobile width. **Known gaps:** a person redirected by a deleted project is not
     told why; no audit trail of who deleted what. **Phase 8.5 slice 3 (rename and
     delete) is complete.**
3. **Invite teammates** by email with roles (the roles enum already exists). **DONE** (collaborators slices A and B, ADR 0024).
4. **Due dates** with an overdue marker. **DONE 2026-10-05 (ADR 0032; owner's picks: set in the edit popup only, an Overdue / No due date filter, a change notifies like other edits).**
   `issues.due_date` (Postgres `date`, migration 0027), a calendar day never a timestamp. Edit popup gets a Due date field; a chip (calendar icon, date, "Overdue" in red when the
   day is before today in the person's timezone and the issue is not done) shows on list, board and sprint cards, My work and the issue page; the activity says "set the due
   date to ..." / "removed the due date"; the Issues page has an "Any due date / Overdue / No due date" filter (`?due=`, the browser sends its own `today`). 5 API tests
   (`due-date.http.test.ts`) and 2 e2e tests (`due-date.spec.ts`, including the same date overdue in `Pacific/Kiritimati` and not in `Pacific/Pago_Pago`); removed one at a
   time to see tests fail: the marker ignoring done, "today" ignoring the zone, the server filter ignoring done. **Not done:** a date at creation, a due sort, "due soon",
   reminder emails (no background jobs). Not tested: the profile activity allow-list change (no test reads a due-date line there), the notification for a due-date edit (the
   existing mechanism, no new code), the seed data has no due dates. Not verified in the user's browser yet.
5. **Small UI wins:** `C` to create an issue, a visible Ctrl+K button in the
   sidebar, filter the issue list by label (click a label), a proper "not found"
   for bad links without the 7-second skeleton. **Checked 2026-10-05:** the visible Ctrl+K button is DONE (the sidebar's Search row shows
   `Ctrl K`), and a bad link says "not found" in under a second is DONE (polish slice 2026-10-01). **`C` to create an issue: DONE 2026-10-05** (it
   focuses the new-issue title on the issues page). Clicking a label to filter the list was DONE earlier (labels slice: pills on the list cards are buttons, `labels-filter.spec.ts`; this line was stale until 2026-10-05).
   **Leftovers batch DONE 2026-10-05 (owner: "do them in one go"):** (a) label pills (three, then +n, plain not clickable) on BOARD and SPRINTS cards, the board and backlog
   responses now carry each issue's labels (one extra query each, like the list), 2 API tests (`board-labels.http.test.ts`) and 2 e2e tests (`board-labels.spec.ts`);
   (b) "Sign out of all devices" on the Account page (a "Devices" section; asks first, ends every session including this one through the existing `POST /auth/logout-all`;
   other devices stop working when their access token runs out, a few minutes), 1 e2e test; (c) the mention list now reopens after Esc when the text after the `@` is replaced
   or pasted over (it stays closed while the same mention is only extended), 1 e2e test. Removed one at a time to see tests fail: board without labels, Esc closing for
   good, sign-out not calling the server. **Not done, on purpose:** audit-log retention (the owner chose to leave it open), Markdown and description mentions (own slices),
   Safari/WebKit (no WebKit browser in the test setup and installing one changes the machine; still unverified). Not mutation-checked: the backlog half of (a) in e2e.
   **Pre-push failure fixed 2026-10-06:** `comments.http.test.ts` ("the timeline shows the edited text...") failed once with `edited: false`. Cause: "edited" compares a comment's `updated_at` with its `created_at`; the first came from NODE's clock (`new Date()`), the second from POSTGRES's (`now()`), and on this Windows machine Node's clock read at least 4 ms behind Postgres's (measured), so a quick edit could look "not later". Reproduced by making Node's clock 25 ms slow; fixed by stamping the edit with `now()` too; a new test edits 25 comments right after posting them. It did not fail in 6 plain reruns, so the exact gap on the failing run is not measured.
6. **@mentions in comments DONE 2026-10-05 (ADR 0033; owner's picks: comments only, mentioned people are told even if they never touched the issue and also by an edit that adds them, the list opens under the box).**
   Type `@` in the comment box and a list of members opens under it (filters as you type, arrows/Enter/Tab choose, Esc closes only the list); the box shows `@Name`, the stored body holds
   `@[Name](user:<id>)`; the posted comment shows each mention as a person link with the hover card; editing keeps them. The server keeps only CURRENT members of the organization (a made-up
   id or another organization's person is ignored), tells the mentioned (one notification even if they are also a participant), and on an edit tells only the people it adds; the bell and
   My work read "mentioned you in a comment". No schema change. 6 API tests (`mentions.http.test.ts`) and 3 e2e tests (`mentions.spec.ts`); removed one at a time to see tests fail: no membership
   filter, an edit notifying everyone mentioned, no exclusion of the writer on an edit. **Not done:** mentions in the issue description (its text feeds the search column, and its event payload would need
   a change), `@everyone`, **Markdown (still open)**. Named limits: two people with exactly the same name in one comment resolve to the last one picked; the list is under the box, not at the caret.
7. **List / Board tabs DONE 2026-10-06 (ADR 0034, step 1; owner picked look B, underline tabs, and removing the sidebar Board link).** The Issues and Board pages show a List / Board switch at the right
   of the title; the sidebar has one "Issues" link for both. They are still two pages: **step 2 (one page, `?view=board`) is open** and needs the board to take the list's filters first. 1 new e2e test
   (`view-tabs.spec.ts`) and 4 existing tests moved from the sidebar link to the tab. Filters are not carried across.
8. **"New issue" button and popup on both pages DONE 2026-10-06 (ADR 0035; owner picked option 3 of four mockups).** The inline create form is gone; a "+ New issue" button (with a C badge) sits in the same place
   on the Issues list and on the Board and opens one popup (title, description), which also gives the Board a way to create. C opens it. 4 new e2e tests (`create-issue.spec.ts`); the C-key, badge, empty-form
   and comment-flow tests were moved to the popup. Removed one at a time to see tests fail: the board row's top spacing (caught). **Not caught by any test:** the refresh after a create (the server's live
   update refreshes the page anyway). **Open:** choosing column/priority while creating needs `status`/`priority` in the create request; a per-column "+" on the board would use it.
9. **Issues list redesign DONE 2026-10-06 (ADR 0036; owner picked option E of seven mockups).** The raised panel with a card per issue became one bordered surface with a header strip (Issue / Status / Priority /
   Due / Who) and two-line rows (title and labels over the key); Edit on hover or focus; stacks by the list's own width, which also fixes the right-hand columns hiding under the issue side panel. 4 new e2e tests
   (`issue-list.spec.ts`); removed one at a time to see tests fail: the room left for the side panel, the Edit reveal (both caught). `ScrollPanel`'s `raised` look is gone. **Not changed:** the search results page still uses
   the older cards; the header is not a sort control yet.
10. **Board card redesign DONE 2026-10-06 (ADR 0037; owner picked option B "priority edge" of five).** The card on the board, the sprints page and in the drag preview: a colored left edge for the priority (existing tokens),
   key and due date on the first line, the assignee top right, the title, and a footer with quiet outlined label tags and the priority word; the grip shows on hover, focus and touch. Only the look: the dnd-kit wiring was not touched,
   and the drag, backlog-order and drag-performance specs pass unchanged. 5 new e2e tests (`board-card.spec.ts`); removed one at a time to see tests fail: the edge, the grip reveal (both caught).
   **Not done:** comment and attachment counts (not in the board data).
11. **Session renewal and inactivity logout DONE 2026-10-06 (ADR 0038).** A tab left in the background showed "Invalid or expired access token" errors: the app refreshed the 15-minute token only when the page loaded.
   Now a rejected request renews the token and is sent again (once; one renewal at a time, across tabs through a Web Lock, because the server revokes the session if a refresh cookie is used twice), a tab that returns after
   10+ minutes renews first, the socket reconnects after renewal, a request with no answer reads "Could not reach the server" instead of "Failed to fetch", and a session that is really gone sends the person to log in with a notice.
   Inactivity: after 30 minutes without input a dialog warns for 60 seconds ("Stay signed in" / "Sign out now"), then the session is ended and revoked. 9 new e2e tests (`session-renewal.spec.ts`, `idle-logout.spec.ts`, time moved with
   Playwright's clock). **Not checked in a real browser:** a real 15-minute idle, two real tabs, Safari. **Open:** a "remember me" / a longer limit for private computers; the exact cause of a literal "Failed to fetch" was not reproduced.
12. **Demo organization DONE 2026-10-06 (ADR 0039; Phase 9 "demo org").** `pnpm db:seed:demo` builds "FlowDesk Demo": five people (Owner `demo@flowdesk.test`, Admin, two Members, a Viewer; all with the password `Demo123!@#`), three projects, 76 issues with
   descriptions, labels, assignees, priorities and relative due dates, sprints with history (4 completed + active + planned in WEB), 23 comments with @mentions, notifications for the owner (5 unread), pending invitations and a 17-row audit log.
   `--reset` rebuilds it; production needs `ALLOW_DEMO_SEED=true`. 14 API tests (`seed-demo.http.test.ts`); three deliberate breaks were each caught. Looked at in a separate headless browser in light and dark on every main screen.
   **Not done:** attachments and photos; scheduling the reset (Phase 9 jobs); guarding the demo owner's password change.
13. **Guided tour (Tutorial button) DONE 2026-10-06 (ADR 0040).** A "Tutorial" row in the sidebar footer starts a 14-step tour (welcome, projects, search, My work, New issue, filters, List/Board, the board, opening an issue, sprints, analytics,
   notifications, theme, goodbye) with a dimmed page, a highlight around the part and a card with Back / Next / Skip; Esc, arrow keys, focus back to the button. Our own engine (`shared/tour`, no dependency), steps in `features/app-tour`, parts named by
   `data-tour` attributes on about twelve elements. A step whose part is not on screen is passed over; it never changes data. 6 e2e tests (`app-tour.spec.ts`); two deliberate breaks (highlight shifted, no skipping) were each caught.
   **Not done:** an automatic offer to new people, per-role tours, a record of who finished it, a real phone, a real screen reader.
14. **Auth pages redesign + show/hide password DONE 2026-10-06 (ADR 0041; owner picked option A4 of eight mockups).** Login, Register and every other public auth page: a frosted-glass card over three soft blurred shapes (new semantic tokens for the glass and the shapes, a plain-surface fallback where the
   browser cannot blur or less transparency is asked for); on Login and Register a "Log in / Create account" switch at the top of the card. A show/hide button in every password field (`PasswordInput`, 8 fields in 6 forms; the label naming fixed through `Field`). 7 new e2e tests
   (`auth-pages.spec.ts`); three deliberate breaks were each caught; 13 existing test lines needed `{ exact: true }`. **Built afterwards (item 15):** Google/GitHub sign-in (the owner must create provider apps; needs a callback endpoint, account linking and a decision about accounts without a password).
15. **Sign in with Google and GitHub DONE 2026-10-06 (ADR 0042; owner chose both providers, accounts without a password, linking only on a provider-verified email, and connected accounts on /account).** Buttons on Login and Create account (only for providers
   whose credentials are in `apps/api/.env`); the authorization-code flow with PKCE on the server, its state in a signed 10-minute cookie, a callback that redirects into the app (no token in any URL). Decision table: connected provider -> sign in; unverified provider email -> refused;
   existing account with that email -> connected (an account whose own email was never verified loses its password and sessions first); otherwise a new passwordless account with its own organization. `users.password_hash` is nullable, new table `oauth_identities` (migration 0028).
   /account gains Sign-in methods (Connect / Disconnect, never the last way in, locked in a transaction) and "Add password" for passwordless accounts; change password / change email / login handle the missing password. `lib/oauth/` seam with Google, GitHub and a test-only fake.
   Tests: 23 API (`oauth.http.test.ts`), 6 adapter parsing tests (`providers.test.ts`, canned answers), 7 e2e (`oauth.spec.ts`); five deliberate breaks were each caught. **NOT verified: a real Google or GitHub round trip** (needs the owner's client ids and secrets; redirect URLs are in `.env.example`),
   and whether GitHub enforces the PKCE parameters. **Not built:** OAuth inside the invitation flow, "remember me", more providers, choosing the organization name at provider sign-up.
16. **Landing page at `/` DONE 2026-10-07 (ADR 0043; owner picked the centered hero with the fading screenshot, content B, then asked for a richer page and a different background).** A logged-out visit to `/` shows a public page (`RequireAuth` `publicHome`): hero, a Board / Issues / Analytics preview made of real screenshots of the demo
   organization (static JPEGs in `apps/web/public/landing/`, retaken by `pnpm landing:shots`), an about section, how it works, eight feature tiles, four use cases, a closing call to action, and a "Built by" block with the owner's email and phone. Soft diagonal ribbons replace the dot background. Log out and expired sessions still go to `/login`
   (`SessionEndReason` gained `signed-out`). 11 new e2e tests (`landing.spec.ts`); three deliberate breaks (logout reason, the dark picture, the path rule) were each caught, after adding the test for "any other app page still goes to login" that the third one exposed as missing; text contrast measured at 5.11:1 or better in light and dark, wide and phone.
   Two existing tests that assumed the old redirect were updated on purpose (`account.spec.ts`, `my-work.spec.ts`). **Not verified:** Safari and Firefox rendering, a real phone, link previews, load time. **Public contact details** can be harvested by bots (the owner's choice).
17. **"Try the demo" DONE 2026-10-07 (ADR 0044; owner chose a private copy per click, the tour starting by itself, a visible "deleted after" notice, buttons in the landing hero and closing block).** `POST /api/v1/demo/start` builds a private, passwordless copy of the demo organization (the ADR 0039 data, same engine, now parameterised)
   and signs the visitor in; it is off unless `DEMO_ENABLED=true`, rate limited (5 per hour per address), capped (`DEMO_MAX_ACTIVE`), and the server refuses an expired copy itself (`demo_expired`) as well as deleting expired copies on the next start. A demo may not invite people, change email or password, connect Google/GitHub, upload, or pass 300 issues (403
   `demo_restricted`, before an upload body is read). The app shows a demo bar with a countdown and "Start a new demo" at the end. 13 API tests in `demo.http.test.ts`, 5 e2e in `demo.spec.ts`; five deliberate breaks (cleanup, cap, one guard, tour start, re-keyed countdown) were each caught; the full API suite (473) passes.
   A copy takes about 0.2 to 0.3 s to make locally. **Not verified:** behaviour behind a real reverse proxy (the per-address limit needs the real client address), memory and disk with many copies alive, Safari/Firefox. **Phase 9 follow-ups:** a scheduled job for the clean-up, and a shared (Redis) rate limiter.
18. **My work redesign DONE 2026-10-10 (ADR 0057; owner picked D2a after four rounds of full-page mockups).** The page `/` opens is now a header (greeting for the person's own time of day, one sentence of counts, a week ring, New issue), the week as an agenda (`?week=`, every dated issue on its own day, overdue ones with a red chip), and a right side with all overdue issues, the unread notifications and what changed lately. Wide screens do not scroll the page (the two areas scroll inside the window: `ScrollPanel` got `bottomGap`); issues open in the side panel (ADR 0025); the tour has two new steps (16). New `GET .../my-work/week?from=&to=` for the ring ("of my issues due this week, how many are done"; undated issues not counted). The owner tried Start / Done / Tomorrow buttons and had them removed. 3 API tests (three deliberate breaks each failed one), 9 web unit tests, 7 new e2e tests plus updates (back links, OAuth greeting, motion and demo checks). **Not verified:** Safari/Firefox, a phone by eye, and the source of a "ResizeObserver loop" message in Vite's client log (no test failed). The design-system page's mockup section (options A to D2f) was removed.
19. **Labels page polish, a sidebar link to the account page, readable profile addresses DONE 2026-10-10 (ADR 0058).** The Labels page has a "New label" button (hidden for viewers; same API as creating a label from an issue) that opens an inline row with ten preset colours plus the native picker, the name, and a live preview of the pill; the list is one bordered surface with a header strip (Label, Colour, Created) like the Issues list. The sidebar has "Account settings" below "Design system" (named so it is not confused with a project's own "Settings" link; two specs now match that link exactly). Profiles are `/people/daniel-okafor-b50fc811`: the name for reading and the first 8 characters of the id for finding, old full-id addresses are rewritten, a changed name never breaks a link. 5 unit tests for the address helpers, 6 e2e tests for labels and the sidebar link, 1 for the profile address, and the existing specs updated. **Not verified:** the colour presets' contrast against white pill text was calculated, not measured in a browser; two people whose ids share the first 8 characters (not guarded); Safari/Firefox.
20. **Local time and the ResizeObserver message DONE 2026-10-10 (ADR 0031 amended, ADR 0057 amended).** Times next to comments, activity, the audit log, members and profiles now read "5 minutes ago" for the first day and then the actual date and time in the person's own timezone (account setting, else the browser's), e.g. "Oct 9, 3:42 PM"; the hover has the full time with the zone's name. `ScrollPanel` re-fits in the next animation frame, which stopped the Vite "ResizeObserver loop" message (none in a 57-test run that used to show it). 4 unit tests, 1 e2e. **Not changed:** analytics weeks are UTC weeks. **Not verified:** a non-English browser by eye.
21. **Demo timezone and My work on narrow windows DONE 2026-10-11 (ADR 0039 amended, ADR 0057 amended).** "Try the demo" signed visitors in as Alex Morgan, whose saved timezone was New York, so every time showed in New York; the five demo people now have no saved timezone (the browser's), and a re-run of the seed resets it. API test; breaking it on purpose (New York put back) failed it. My work now picks one or two columns by the width its content really has (the side panel takes 31rem of it), not by the window, so at about 1270px with the panel open the columns stack at full width instead of being squeezed; e2e test, and forcing two columns failed it. **Not checked:** other pages at medium widths; copies of the demo already alive on the live site keep New York until they expire.
22. **Projects page redesign DONE 2026-10-11 (ADR 0059; owner picked option A of four mockups, then no per-project colours).** Each project is a card: initials tile, name, key, "Updated ...", a progress bar, open / in progress / overdue counts and the running sprint with days left. New `GET .../projects/summary?today=` returns all the numbers in one grouped query; "New project" is a button and popup for owners and admins (the inline form is gone). 4 API tests (making overdue count done issues failed one), 4 web unit tests, 5 e2e tests, and the specs that used the inline form updated. **Not verified:** the numbers are not live (they refresh when the page opens); a phone, Safari and Firefox by eye; the single query's cost with very many projects.
23. **Members page grouped by role, Labels page on a phone DONE 2026-10-11 (ADR 0060).** The Members page is one list in one surface with "Owner and admins", "Members" and "Viewers" headings and counts, a row per person (photo, name, job title and email, a pill for owners and admins, join date, controls at the right), and pending invitations in the same style; no API change (owner's pick C of four mockups). The Labels rows on a phone now have Edit and Delete in the same place on every row (the colour and date moved to a small line under the name); an e2e test checks it. A try at opening issues as full pages on a phone (instead of the full-screen panel) was built, then reverted at the owner's request to keep one behaviour everywhere. 1 new e2e test for the grouping and 1 for the Labels phone layout. **Not verified:** Safari/Firefox; the Members page was screenshotted with seeded people, not looked at on the owner's real data.
24. **Full issue page redesign and test pruning DONE 2026-10-11 (ADR 0061; owner picked B of three mockups).** The page has Edit at the right of the title, a properties card (status, priority, assignee, due, labels, reporter, created, updated) in a centered 768px column, and the description in its own card; the side panel is unchanged. At the owner's request 40 layout and animation browser tests were deleted (302 to 262; 22 from `motion.spec.ts`), and one scroll test got a taller window because the page is now taller. 3 new e2e tests. **Not verified:** the built page by screenshot, Safari and Firefox.
25. **IN PROGRESS: pasting images into comments (ADR 0062). Slices 1 (server and format), 2 (the editor) and 3 (the description, ADR 0063) are done 2026-10-11.** Paste or drop an image in the comment box (like a chat app), uploaded at once as a draft with no event or notification, referenced in the text as `![name](attachment:<id>)`, linked to the comment when it is posted. Three slices: (1) draft column, reader and server linking with tests, (2) the editor paste and inline drawing, (3) the description as a rich editor (decided separately). Videos stay attachments.
26. **DONE 2026-10-12: the analytics page redesign (ADR 0064).** Summary tiles on top, throughput as an area chart with a dot per week, committed next to completed for sprint velocity, the status split as one segmented bar, labels as a list with their own colored dot and bar, and the period as a row of choices (still in the address). Chosen by the owner from mockups A to D (A's page with B's chart). No API change. Checked in the owner's browser in light and dark, hover with a real mouse on the throughput chart; two e2e tests added. Not done: median and 90th-percentile markers on the cycle-time histogram, a real phone check (looked at 420px once), `/design-system` entries.
   Not tested: that `mentions` stays out of the public profile activity (that feed returns `{}` for comment events by design). **Markdown STILL OPEN (checked 2026-10-05: descriptions and comments are plain text; the
   description keeps its line breaks since 2026-10-05, nothing more).**
   **Two navigation bugs noted 2026-10-05 (owner), FIXED the same day** (the issue page's, Edit profile's and Account's back links now use `PageHeader`'s `history: true`, so Back returns to where the person came from and the named page is only the fallback for a first page or a new tab; 3 e2e tests in `back-links.spec.ts`; removing the option from the issue page and the edit page made 2 of them fail; the Account test was not mutation-checked). The original report: (1) An issue opened from My work shows "<- {project name}", not "Back": `IssueDetail`
   passes a fixed back link without `history: true` (the `PageHeader` option the profile page already uses), so Back should return to the page the
   person came from (My work, the board, search, a notification), with the project as the fallback for a first page or a new tab. (2) Profile then
   Edit profile then "Your profile" then Back goes round in a circle: the edit page's back link is a plain link that PUSHES a new history entry, so
   history grows profile, edit, profile, edit. Proposed: the edit page's link goes back through history (`history: true`) so it pops to the profile, and
   Account's link to Edit profile the same way. Check every other back link for the same pattern when fixing.
7. **A "my work" home** (assigned to me, recent activity, unread notifications)
   instead of `/` redirecting to the project list. **STILL OPEN (checked 2026-10-05: `/` still lands on /projects).**
   **Added 2026-09-30 (owner idea): search as a popup, not a separate page.**
   Today the sidebar "Search" link goes to a `/search` page, while Ctrl+K already
   opens a search popup (the command palette). Proposal: the sidebar Search entry
   opens that same popup. **Decided by the owner:** `/search` stays, but is only
   reached from a "Show all results" row in the popup (so bookmarkable `?q=` links
   and the existing ranking and tenant tests are kept). Still to check when the
   slice starts: how many results the popup shows today, and whether "Show all"
   should appear always or only when there are more results than fit.
   **Built 2026-09-30.** The open/closed state moved into a small shared context
   (`shared/search-palette`) because a widget may not import another widget; the
   sidebar Search entry is now a button with a `Ctrl K` hint and the palette has a
   "Show all results" row (keyboard and mouse) going to `/search?q=`. The row shows
   whenever there is at least one result. Checked live in Chrome with real
   mouse and keys, including the no-reload-login path: sidebar click, Ctrl+K,
   Esc, reopen after Esc, arrow to the row and Enter, mouse click on the row, and
   `/search?q=` still loading. **Not verified:** how many results the popup
   returns at most; a really long result list. **Testing note:** a backgrounded
   Chrome tab (`visibilityState: hidden`) stalls Playwright clicks and stopped
   the dialog's `close` event firing, which looked like a bug; it was not. Check
   `document.visibilityState` first. **Found and fixed the same day:**
   clicking the dimmed backdrop did not close the popup (no handler; a native
   `<dialog>` only closes on Esc; it predated this slice). Now a click whose
   target is the dialog itself closes it. Checked live: backdrop click closes;
   clicks on the input and on the footer text keep it open; Esc and reopen reset
   the query.
   **Owner also said they forgot one more idea; ask them to add it here.**
   **Verification pass in a real browser, 2026-10-01** (the "not verified" items of
   slices 1 to 3, checked with the Playwright MCP against the dev servers; throwaway
   data only, all removed afterwards):
   - **Found and fixed (two real bugs of mine):** (1) the issues list filter row
     (status, priority, assignee, sort) did not wrap, so on a narrow screen the sort
     button was cut off and the page scrolled sideways (531 px of content in a 469 px
     window): `flex-wrap`; (2) in the search popup the "Show all results" row sat at
     the bottom of a 2,286 px scrolling list and was not scrolled into view when
     highlighted by keyboard: now pinned to the bottom and scrolled into view. Both
     have e2e regression tests that fail without the fix (measured width; row inside
     the list box).
   - **Verified OK:** mobile width (about 470 to 490 px, the smallest this browser
     window goes) of the Labels page (edit and delete confirm), project settings
     (including the delete form), sprint rows (rename, delete confirm), the issue
     Danger zone, light mode; assignees in a REAL mouse drag on the board and the
     sprints page (avatar on the card, in the drag overlay, after the drop and after a
     reload); sprint delete in the browser (complete, then delete, the issue returns to
     the backlog); a 64-person member list (64 options, type-ahead selects by name, a
     person deep in the list can be assigned and filtered on; deleting those users
     later cleared the assignee and kept the issue); the search popup returns at most
     25 results plus the "Show all" row; a direct upload appears in zero comment cards
     (one activity line, listed in Attachments without "from a comment"); the comment
     time carries the exact date (`title`, e.g. 9/30/2026, 11:15:26 PM); renames in one
     tab reach another tab only when that tab is focused (it stays stale while
     unfocused, updates on focus).
   - **Project delete at volume, over the real UI:** a throwaway project with 20,000
     issues, 20,000 events, 5,000 comments, 1,500 attachment rows and 1,500 real files:
     click to redirect in 1.24 s; afterwards zero rows of any kind left, all 1,500 files
     gone from disk (7 older files remained), other projects intact, no "failed to
     delete" warnings. (Seeding that data took over 20 minutes on this machine, cause
     not investigated.)
   - **Added automated:** a file already missing from disk does not block a delete (the
     failure is logged, not fatal); fails if `deleteFile` rethrows.
   - **Still NOT verified:** a native file chooser supplying a file (the Attach files
     button does open a real chooser, but Chrome refuses to let the tool fill it, "Not
     allowed"; files were injected with `DataTransfer` instead); a screen narrower than
     about 470 px (the browser window cannot go lower); the second person's own browser
     view of a comment (covered by the two-context e2e tests, not by the MCP, which has
     one profile); the native `title` tooltip itself (only its text was read).
   - **Small things noticed, not fixed:** initials for a name that ends in a number
     come out as "P5" (fine for real names); the dark-mode avatar circle is only
     faintly lighter than the card.
   **Polish slice: DONE 2026-10-01** (four gaps found by the verification pass above):
   - **Notice after a deletion:** a redirect caused by a deleted project or issue now
     carries a one-off notice ("This project was deleted." / "This issue was deleted."),
     shown by `Page`, dismissible, gone when you navigate on.
   - **Renames and deletes reach other tabs:** `org:changed {kind}` on the organization
     room for project renames, label rename/delete, sprint rename/delete; the app shell
     (`useLiveOrganizationUpdates`) refetches the matching list. Measured: a background,
     unfocused tab updated 173 ms after the save (before: only on focus).
   - **No more 7-second "not found":** the query client does not retry 4xx answers
     (network errors and 5xx still retry); a link to a missing issue now says so in 0.7 s
     in the real browser. The 15 s timeout in the delete e2e test is gone.
   - **The previous assignee is told** when the issue is unassigned or handed on
     (ADR 0021 amended), even if they never acted on it; self-unassign tells nobody
     about your own action; edits that leave the assignee alone add nobody.
   - **Found by the tests while building it:** my first version of the previous-assignee
     SQL passed a JS array to drizzle, which expands it into a row list `($1, $2)`
     (`()` when empty); that is not a `uuid[]`, so creating ANY issue returned a 500.
     Caught by a new broadcast test before it shipped; fragment now built explicitly.
   - **Also added:** API broadcast tests for `org:changed`, `project:deleted` and
     `issue:deleted` (6 tests in `realtime/org-broadcast.test.ts`; the delete broadcasts
     of slices 3B and 3C were previously covered only by e2e), each also asserting another
     organization's room hears nothing where that matters.
   - **Verified:** mutations (no project-rename broadcast; 404s retried again; notice never
     shown; previous assignee not passed on) each fail a named test; real-browser checks of
     the 0.7 s not-found, the live rename, and the notice for both the deleter and a second
     tab (redirected, notice shown, Dismiss clears it and keeps the URL). A fifth mutation
     (previous assignee passed on every update) is an equivalent change and cannot fail any
     test: with an unchanged assignee, "previous" is the current assignee, told once either
     way. Suites: 272 API tests, 20 e2e tests.
   - **Not done / still open:** an audit trail of who renamed or deleted what; sorting by
     priority; the dark-mode avatar contrast; the Labels page confirm layout.
   **Button colours: DONE 2026-10-01 (owner request).** Save and Delete no longer look
   like every other dark button. New semantic tokens in all three theme blocks
   (`--color-bg-action-success` emerald-700, `--color-bg-action-danger` red-700,
   `--color-text-on-action-strong` white) and three Button variants: `success` (solid
   green, every Save: issue edit, comment edit, project/label/sprint rename), `danger`
   (solid red, the FINAL confirm of a delete), `dangerOutline` (red text and border, the
   FIRST click of a delete, so it reads as dangerous without shouting). Documented on the
   design-system page. **Measured on the real computed colours (light / dark):** text on
   the green 5.36 / 5.36, on the red 6.42 / 6.42 (AA needs 4.5); solid button against the
   page 4.92 / 3.69 (green), 5.89 / 3.08 (red; 3:1 is the bar for UI components, so red on
   dark is only just over); outline text and border against the surface 6.42 / 6.21.
   **Verified:** screenshots of the three buttons in both themes; an e2e test on the
   computed colours (Save green, Delete opener red-bordered, final confirm red), 6 of 6
   repeat runs, and two mutations (Save back to default, confirm back to gray) fail it.
   Other primary actions ("Add issue", "Comment", "Log in") deliberately stay dark.
   **Not done:** the comment "Delete / Yes" text links stay link-style red text;
   whether the dark-mode red should be lighter for more margin.
   **Button colours: DONE 2026-10-01 (owner request).** Save and Delete no longer look
   like every other dark button. New semantic tokens in all three theme blocks
   (`--color-bg-action-success`, `-danger`, `-danger-strong`,
   `--color-text-on-action-strong` white) and Button variants: `success` (solid green,
   every Save: issue edit, comment edit, project/label/sprint rename), `danger` (solid
   red, the FIRST click of a delete) and `dangerStrong` (a STRONGER red for the final
   irreversible confirm: darker in light mode, brighter in dark mode, because a darker red
   all but vanishes on the dark page). The owner first saw an outline for the first click
   and asked why not solid red; chose solid red then a stronger red. Documented on the
   design-system page. **Measured on the real computed colours (light / dark):** text on
   green 5.36 / 5.36, on the first red 4.77 / 6.42, on the strong red 8.36 / 4.77 (AA needs
   4.5); button against the page: green 4.92 / 3.69, first red 4.38 / 3.08, strong red 7.66 /
   4.15 (3:1 is the bar for UI components; the first red on dark is only just over).
   **Verified:** screenshots in both themes; an e2e test on the computed colours (Save
   green, Delete red, the confirm a visibly different red), 6 of 6 repeat runs, and
   mutations (Save back to default, confirm back to gray, confirm the same red as the first
   click) fail it. Other primary actions ("Add issue", "Comment", "Log in") deliberately stay
   dark. **Hover and pressed states (same day, owner asked "but on hover?"):** hover was
   only a 10% fade. Now a DEEPER shade in both themes (new tokens `-success-hover`
   emerald-800, `-danger-hover` red-700 / red-800 in dark, `-danger-strong-hover` red-900 /
   red-700 in dark), a pressed state (`brightness-90`), and in dark mode a soft light ring
   (`--color-ring-action-hover`, white at 50%) so a darker button does not sink into the dark
   page. Why deeper and not brighter: measured, a brighter hover on dark drops white text on
   the green to 3.65:1 and on the strong red below 4.5:1 (brightening only works for the
   first red); a darker fill makes white text MORE readable. Hover and pressed apply to
   enabled buttons only (a disabled button does not react). **Verified:** e2e tests read the
   real computed styles on the design-system page in light and dark (hover is darker than
   rest, white text on every hover colour at least 4.5:1, no ring at rest, ring on hover in
   dark only), 5 of 5 repeat runs per theme, and two mutations (no hover fill on Save; no
   ring in dark) fail them; screenshots looked right. **Found while testing:** my first
   version of the ring check read the first (transparent) shadow of a stacked box-shadow
   list and said there was no ring; the ring was there, the test was wrong.
   **Not done:** the comment "Delete / Yes" text links stay link-style red text; the
   dark-mode hover boundary of the green is only about 2.6:1 against the page (the ring and
   the unchanged label carry it); touch screens have no hover.
   **Comment cards: DONE 2026-10-02 (first part of the item below).** Design pass: three
   options (speech bubbles, card with a header strip, open thread) were built from the real
   tokens on the design-system page; the owner chose **B, the header strip**. Built: avatar,
   name, relative time (exact date on hover), "(edited)" in a tinted header; Edit and Delete as
   icon buttons shown on hover or keyboard focus (always on touch screens); inline edit with a
   green Save; a delete confirmation that says the files stay in Attachments; the file list as
   chips (icon, link, size); a dashed "Comment deleted" card; the timeline's grey left rail is
   gone (activity lines keep a small dot, and the sentence and its time wrap as one run on a
   narrow screen). `Avatar` got a `md` size. The two losing options and their temporary
   design-system section were deleted. **Verified:** 5 new e2e tests (card content, hover and
   keyboard reveal measured on the real opacity, always visible on a touch-emulating context,
   delete Cancel and the files message, a 300-character unbroken word kept inside the card at
   400 px) and the two older comment tests updated for the new "Confirm delete" button;
   mutations (no touch rule, no keyboard-focus reveal, no hover reveal, no word-breaking) each
   fail a test; light, dark and 400 px screenshots of the real issue page looked right.
   **Found while testing:** my first long-word test passed even without the fix, because the
   card clips its contents (`overflow-hidden`): the text was being cut off while the page looked
   fine; the test now also checks the text fits its own box (2,293 px of text in a 336 px box
   without the fix). **Not done yet:** image and video previews (files are still chips), the
   preview popup, video support; the Edit/Delete icon buttons are raw `<button>`s (a candidate
   for the button cleanup slice).
   **Image preview popup: DONE 2026-10-02 (slice 2 of the item below).** Clicking an image
   attachment, in the issue's Attachments list or on a comment's file chip, opens a modal
   preview: the image fitted to the window, its name and size, zoom out / in (10% to 500%,
   steps of 1.25, the percentage is measured from the drawn size), Fit, a Download link (the
   `download` attribute, so it saves instead of showing), and Close. Keyboard: Esc closes,
   `+` / `-` zoom, `0` fits. Clicking the dimmed area closes it; focus returns to what opened it.
   Non-images (PDF, text, CSV) keep the old behaviour: a link in a new tab. A middle or
   ctrl/cmd click on an image still opens it the normal way. Built as a domain-free
   `shared/ui/ImagePreviewDialog` (since renamed `MediaPreviewDialog`, ADR 0023) (native `<dialog>`, like the search popup) plus one
   `entities/issue/ui/AttachmentLink` used by both places; `formatFileSize` is now one shared
   helper (two copies removed); `buttonVariants` moved to its own file so the Download link
   can look like a Button. **Expired links:** the signed link lives 5 minutes, so when the
   image fails to load the attachment list is refetched once and the image is requested again
   (with a `retry` parameter, because a refetch within the same second can mint an identical
   link); no backend change. **Verified:** 7 e2e tests, 28 of 28 across 4 repeat runs (opens with
   name, size and Download, Esc closes and focus returns, reopens; outside click and Close;
   zoom by button and keyboard measured on the real drawn width; the Attachments list opens the
   same popup; a text file opens a new tab and no popup; an expired link is recovered, simulated
   by failing the first image request with 403; a 400 px screen keeps every control inside the
   window); a generated PNG with real dimensions (`e2e/support/png.ts`); five mutations (load error
   not handled, no `download` attribute, every file type opens the popup, zoom does nothing, the
   bug below back) each fail a named test; light, dark and 400 px screenshots looked right.
   **Real bug found by the tests and fixed:** the popup opened and closed itself in the same
   instant. React runs effects twice in development, and the first cleanup called
   `dialog.close()`, whose `close` event fired after the second run had re-attached its listener,
   so the popup reported itself closed. Fix: no `close()` in the cleanup, and `showModal()` only if
   not already open. **Not done yet:** video (slice 3: allowed types, range requests, a video
   player in this popup), thumbnails inside the comment, previous / next between images, pinch or
   wheel zoom, PDF preview. **Notes:** zoom percentages above fit make the image scroll inside
   the popup; the first focusable control (the close X) gets the focus ring when the popup opens.
   **Video and comment thumbnails: DONE 2026-10-02 (slice 3 of the item below, ADR 0023).**
   `video/mp4` and `video/webm` can be attached (10 MB cap unchanged; other video types are
   refused by the form and the API). The download route now answers `Range` requests (206 with
   `Content-Range`, 416 past the end, whole file for anything unsupported) so seeking works, and
   sends `nosniff`. Comments show images and videos as 96 px thumbnail tiles (the original scaled
   by the browser; a video shows its first frame with a play badge); documents stay text chips.
   Clicking a tile opens the popup, which is now `MediaPreviewDialog`: a video gets the browser
   controls and autoplay, no zoom. Thumbnail and popup share `useAttachmentPreview` (expired-link
   refetch). **Verified:** API tests (mp4/webm accepted, mov and 11 MB refused, byte-exact slices
   for four range forms, 416, whole file with headers, several ranges ignored, tampered signature
   with a Range still 403, missing file 404) plus 6 unit tests for the parser; 6 new e2e tests
   (a WebM recorded in the browser: tile with measured 160x90 first frame; popup plays, has
   controls, no zoom, Download, and the media request got 206; image tile; document chip; expired
   link recovered for a thumbnail; mov refused); full e2e 41 of 41. Mutations caught: suffix range
   off by one (2 tests), range ignored by the route (4 API tests and the 206 e2e), thumbnail load
   error not handled (the expired-link e2e). **Not verified:** seeking in a real long video by hand
   (the e2e video from MediaRecorder has no seek index), mp4 playback (no mp4 fixture was made;
   mp4 is covered only by the upload/download tests), Safari/Firefox. **Not done:** previous /
   next between media, PDF preview, real thumbnails, byte sniffing.
   **Activity lines and person cards: DONE 2026-10-02 (owner design passes).** Each activity
   line on an issue is now an icon in a tinted circle (green added, red removed, status colour
   for a status change, accent for other changes, muted for a reorder), the sentence with real
   badges for status, priority and label, and the time at the right edge (new `widgets/activity-line`;
   three semantic tokens `--color-event-*`, shown on `/design-system`). A person's name is a button
   that opens a small card (avatar, name, role, email) on hover or keyboard focus: in the timeline
   (the actor and anyone mentioned, such as the assignee), comment headers (avatar and name),
   the issue header assignee, the "also viewing" line and the attachment list. Built as a
   domain-free `shared/ui/PersonHover` plus `entities/member/PersonName`; the attachment list takes
   the person through a `renderPerson` prop because entities cannot import each other. The card
   opens after a 300 ms pause with a 150 ms fade and closes after 100 ms (the owner found the
   instant version too jumpy). **Bug found by the owner and fixed:** the card opened anywhere on a
   comment, because the comment card is a Tailwind `group` and the card used a plain `group-hover`;
   the card now has its own named group (`group/person`). **Verified:** 11 new e2e tests
   (`activity-line.spec.ts`, `person-hover.spec.ts`: layout, colours resolved from the tokens, hover
   and keyboard, delay, moving onto the card, no opening elsewhere on a comment, phone width, the
   "also viewing" names with a second user), 50 of 50 e2e overall, repeat runs stable; mutations
   caught (no delay, unnamed group). **Not done:** the card on board and sprint card avatars
   (inside links and drag surfaces), notification rows (the whole row is a button), the sidebar
   user name (the card would open off screen); a "View profile" link (no profile page yet); dark
   mode and a real touch device were not looked at.
8. **Attachment previews (the rest of this owner idea, 2026-10-01; do it
   before Phase 9).** Today an attachment is only a link, and a comment is a grey
   rail with text. Wanted:
   - **Preview popup:** clicking an attachment that is an image or a video opens a
     preview in a popup (a native `<dialog>`, like the search popup) instead of
     navigating or downloading; below it a **Download** button and **zoom** (and
     close with Esc or a click outside). Other types (PDF, text, CSV) keep the
     current open/download behaviour, or get a preview later.
   - **Small previews in comments:** an image or video uploaded with a comment shows
     as a small thumbnail inside that comment; clicking it opens the same popup.
   - **Better comment cards:** replace the "grey line and nothing else" look with a
     real card: avatar (initials, as on issue cards), name, relative time with exact
     date on hover, "(edited)", the Edit/Delete actions tucked in, files shown as
     thumbnails or file chips. Needs a design pass first (a screenshot comparison of
     two or three options for the owner to pick), like the Phase 3.6 work.
   - **Things to settle when this starts (found by reading the code, not guessed):**
     video is **not allowed today** (`ALLOWED_ATTACHMENT_MIME_TYPES` has png, jpeg,
     gif, webp, pdf, txt, csv; max 10 MB), so allowing video is a decision about types
     and size (and the API only trusts the client-sent MIME type, no byte sniffing);
     downloads go through a **signed URL that lives 5 minutes** and is minted when the
     attachment list is fetched, so a thumbnail left on screen could stop loading
     after 5 minutes unless it is refetched or the URL is minted at view time; the
     download route currently answers `Content-Disposition: inline` (so the browser
     decides between showing and saving); a video needs range requests for seeking,
     which the current file route does not do; decide thumbnail size and whether to
     generate real thumbnails or just let the browser scale the original.
   - **Tests when built:** e2e (open the popup, Esc closes it, Download link has the
     right target, a comment with an image shows a thumbnail that opens the popup),
     keyboard and focus handling of the dialog, and the narrow-width check.
9. **Button cleanup (owner decision 2026-10-01: its OWN small slice, AFTER the
   attachment-preview and comment-card work, not folded into it).** `shared/ui/Button`
   is already the one button (variants `primary`, `secondary`, `success`, `danger`,
   `dangerStrong`; sizes `sm`, `md`; `fullWidth`; colours and hover from semantic
   tokens). A count on 2026-10-01 found it is not used everywhere: 41 `<Button>` uses
   against 26 raw `<button>` elements, and 10 `className` overrides on Buttons. Many of
   the raw ones are legitimate (icon-only buttons, sidebar items, theme switch, chart
   toggles, search rows, the notice's dismiss X). The real gap is the **link-style text
   buttons** (Edit, Remove, Delete, Yes/Cancel on comments, attachments and issue
   cards) that repeat `text-[var(--color-text-link)] underline` by hand. Plan: add a
   `link` variant (and maybe a `loading` prop), convert those, remove the overrides,
   keep legitimately different controls raw, and add a test that fails on a new raw
   styled button where a variant exists (or at least a documented list of exceptions).
   Do it after the comment cards, because the new cards will change most of those
   buttons anyway.
   **Button cleanup: DONE 2026-10-02.** `Button` gained a `link` variant (underlined, link
   coloured, no padding) and `buttonVariants` is now merged with tailwind-merge so it can also
   style a router `<Link>` or an `<a>` (`buttonVariants({ variant: "link" })`). New `IconButton`
   (a required `label` that becomes the aria-label; tones neutral, danger, sidebar; sizes sm, lg).
   Converted: the link-style text buttons (attachment Remove and name, issue card Edit, issue
   header Edit, Mark all read, four chart "View as table" toggles, the page back link, five
   login/register links) and the icon buttons (comment Edit and Delete, the popup close X, the
   notice dismiss X, the two mobile menu buttons). The single leftover `className` override on a
   Button was a margin. **Guard:** two lint rules (`eslint.config.js`, run by `pnpm lint` and the
   pre-push hook) fail on a hand-written `text-link underline` class and on any raw `<button>`
   outside a short list of files, each with its reason (the Button and IconButton themselves,
   the person-card trigger, the theme switch, the drag handle, the label and file-chip remove
   buttons, command palette rows, notification rows and bell, sidebar items). The guard found one
   real case while being added (the file name styled as a link inside a comment chip; it is text
   inside a link, so it carries a documented disable). Both rules were proven by a throwaway file
   with a raw button and two hand-written link styles (3 errors, then the file was removed).
   **Verified:** typecheck, lint, 50 of 50 e2e; in the browser, computed styles of the converted
   controls on the design-system page, the issue page, the project page, the analytics page and
   the forgot-password page (same colour, underline, no padding, same font sizes as before; the
   comment icon buttons are still 26 px). **Not verified:** the notification "Mark all read"
   and three of the four chart toggles by eye (only one chart toggle was on screen), the notice
   dismiss X, the mobile menu buttons, and dark mode. **Not done:** `loading` prop on Button.
   **Collaborators, slice A (invite, accept, members list): DONE 2026-10-03 (ADR 0024).**
   Owners and admins invite an email with a role (admin, member or viewer); the invitee opens a
   one-time link, picks a name and password, and the new account joins THAT organization
   (verified email, no personal organization). Only people without an account can be invited
   for now (the app is one organization per user; the refusal says so). New `invitations`
   table (token stored as a hash, partial unique index: one open invitation per organization
   and email), permission `manage_members`, three org-scoped endpoints and two public ones
   (token in the body, rate limited), a Members page at `/members` (member list with role and
   join date for everyone; invite form, one-time Copy link and the pending list with Revoke for
   owners and admins) and the public `/invite` page. Open tabs refresh live (`org:changed`,
   new `members` kind). **Verified:** 16 new API tests (hash-only storage, roles, 403s,
   existing account and already-member refusals, one open invitation per email and the expired
   replacement, tenant isolation, revoke, preview, accept creating a verified account in the
   right organization with the right role, single use, two simultaneous accepts, weak
   password not using the invitation up, email taken meanwhile) and 5 e2e tests (the whole
   journey with two browsers including the owner's page updating without a reload and the
   Copy button, revoke killing the link, a member sees no invite controls, the plain refusal
   messages, a bad or missing link); API suite 305 of 305, full e2e green. Mutations caught:
   no permission check, revoke ignoring the organization, accept not claiming the invitation,
   no broadcast after accepting, the form shown to everyone. **A bug pattern found while
   writing it:** drizzle 0.45 puts the Postgres error code on `err.cause`, so a duplicate-key
   check that reads `err.code` never matches; `auth.service.ts`'s `isUniqueViolation` still does
   that (so a register race would answer 500, not 409), the other modules already read
   `cause`. Named, not changed here. **Not done:** change a role, remove a member (their issues
   become unassigned) and re-send an invitation (slice B); inviting someone who already has an
   account (needs an organization switcher); showing the join date on the hover card; showing
   invitation history; an invitation email that really arrives was not checked (the email
   provider refuses test addresses in dev).
   **Collaborators, slice B (roles, removal, re-send): DONE 2026-10-03 (ADR 0024, "Slice B").**
   On the Members page owners and admins get a role dropdown (admin, member, viewer) and Remove
   (inline confirmation that says the issues become unassigned and history stays) on every row
   except their own and the owner's; pending invitations get Re-send (new link shown once, old
   one dies). Rules in the service, not only the UI: not yourself, never the owner, a 404 for
   anyone not in this organization. Removal deletes only the membership, unassigns their issues
   in the same transaction with a quiet `issue.updated` event (the timeline says "their assignee was
   removed from the organization"), and a removed person who logs in is told to ask for a new
   invitation (403 `no_organization`, no session row created). A removed person can be invited
   back: the account already exists, so the accept page needs no password. Also fixed the register
   race (`isUniqueViolation` read `err.code` instead of `err.cause.code`, so a simultaneous duplicate
   registration was a 500, now a 409). **Verified:** 16 new API tests (roles actually changing
   what the person may do, admin vs owner vs self, owner not assignable, members/viewers refused,
   tenant isolation over HTTP and at the repository, removal keeping the user and their reported
   issues, the unassign event with its payload and the bumped version, access cut at once, the login
   message, re-invite and join-only accept, new accounts still needing name and password, re-send
   leaving exactly one open invitation, re-send of an expired one, re-send permissions) plus
   1 for the register race; 5 e2e tests (role sticks after reload, controls absent on owner and
   self, cancel then remove, unassigned issue and timeline wording, the removed person's login
   message, invited back and logging in, re-send link surviving the refetch); API suite
   322 of 322. Mutations caught: owner unprotected, self allowed, issues not unassigned, remove
   ignoring the organization (needed an extra repository-level test: the service guard hid it),
   orgless account not rejoining, the row key that keeps the re-sent link. **Not done:** closing
   a removed person's open tab or socket, ownership transfer, leaving by yourself, showing the
   join date on the hover card, history of who removed whom beyond the issue events.
   **Issue side panel: DONE 2026-10-03 (ADR 0025; the owner's "open it beside the page, like
   Notion" idea).** Clicking an issue on the list, the board or the sprints page opens it in a
   floating card at the right (480 px, no dimming, the page stays usable; a full-screen sheet on a
   phone): a tinted strip with the key, "Open full page" and close, then the same content as the
   full page (description, attachments, activity, comments, edit, delete, live updates, hover
   cards). The open issue is `?issue=<id>` (Back closes it, a reload keeps it, filters are
   kept); clicking another issue swaps it, clicking empty page closes it, Esc closes it. Built by
   first moving the issue page body into `widgets/issue-detail` (no visible change, 60 of 60 e2e
   green), then adding a `panel` variant, `shared/ui/SidePanel`, `useIssuePanel`/`IssuePanel`,
   and an `onOpen` on the three cards (modified clicks still open the full page; search, the
   command palette and notifications still go to the full page). **Verified:** 14 new e2e tests
   (opening with key, heading level and full-page link; Esc and focus returning to the card; swap
   and Back; inside clicks and posting a comment in the panel; outside click; a page button still
   acting while the panel closes and the other filters surviving; reload; Ctrl+click and the
   full-page link; an unknown id; the board click, with a real drag NOT opening it; the sprints
   page; deleting from the panel; another person's comment arriving live; Esc and clicks inside an
   image preview not closing the panel; the phone sheet; the wide layout measured at 480 px with a
   12 px margin and nothing shifting); mutations caught (cards not exempt from outside-close, the
   Esc guard for dialogs, modified clicks opening the panel, closing on pointerdown). **Real bug found
   by a test and fixed:** closing on `pointerdown` raced with a page button's own URL update (both
   from stale copies) and the button re-added `?issue=`; now it closes on `click` and reads the live URL.
   A second bug found by eye in the real app and fixed: an uploader name at the right end of the
   attachments row had a hidden hover card sticking out past the panel, which added a horizontal
   scrollbar (the card now opens leftwards there, with a test). Two more things the owner found by eye and fixed: in dark mode the panel's attachment cards had the same colour as
   the panel (light mode only showed them through a shadow), so the panel body now uses the page colour like the full
   page; and the open notifications dropdown was painted UNDER the Analytics charts because the sidebar is `sticky`
   (its own stacking context) with no z-index, now `z-30` (the panel stays above at `z-40`). Both have measuring
   tests (card vs body colour in light and dark; a positioned probe over the window must not cover the dropdown).
   **Not verified / not done:** a draft comment is lost when the panel closes, no focus trap (non-modal on purpose),
   no slide animation, the board is covered on narrow laptops, search results still open the
   full page.
   **Priority sorting: DONE 2026-10-03 (ADR 0026).** The project issue list has a Sort dropdown (Newest
   first, Oldest first, Highest priority first) in place of the old button; the choice is in the URL
   (`?sort=priority`, `?order=asc`). Urgent first, newest first within a priority, paged by the same
   kind of keyset cursor (now `(priority, created_at, id)`), refused if replayed against the other sort.
   New migration 0020 index `(project_id, priority, created_at, id)`, added after measuring 20,000
   issues in one project: first page 7.6 ms without it, 0.05 ms with it. **Verified:** 7 new API tests
   (the expected order computed independently in JS, 23 issues over 4-row pages, ascending, page
   boundaries inside groups of equal priorities with limits 1 to 7, filters combined, default sort
   unchanged, cursor from the other sort refused, bad sort value and forged priority refused, tenant
   isolation) and 2 e2e tests (the list in the real UI in all three orders with the URL and a reload; 32
   issues over two pages with Load more, nothing skipped or repeated, plus a priority filter); mutations
   caught (cursor ignoring priority, ORDER BY missing priority, mismatched cursors accepted). **A real
   bug found by a test on the way and fixed:** with the side panel open, a click on a sidebar link did
   not navigate: the panel's close ran after the link's navigation and sent the page back (it resolved
   its address from a stale path). The panel now ignores clicks a link already handled AND builds its
   address from the live path and query (either alone fixes it; the test fails only without both).
   **Not done:** "Lowest priority first" (the API supports it; "none" would come first), sorting the
   board or the sprints backlog, a choosable secondary sort.
   **Audit log: DONE 2026-10-03 (ADR 0027).** An organization-wide, append-only record of who did what,
   for owners and admins at `/audit-log` (sidebar link, filters by person and kind in the URL, Load
   more). 16 actions: project created / renamed / deleted; label updated / deleted; sprint renamed /
   started / completed / deleted; issue deleted; member invited / re-sent / revoked / joined / role
   changed / removed. Each row keeps SNAPSHOTS (the actor's name and the thing's name, title or email
   at the time, plus before/after values), so it still reads after the thing is deleted, and is
   written in the same transaction as the action (before a delete, with the name and size at that
   moment). New table `audit_events` (migration 0021), permission `view_audit_log`, module `audit`,
   `entities/audit` and `pages/audit-log`. Not recorded on purpose: creating labels or sprints, issue
   edits and comments (already on the issue timeline), security events. **Verified:** 13 new API tests
   (each action writes exactly one row with the right stored values; no-ops write none; a deleted project
   and issue are still described; atomic in BOTH directions, using database triggers to force a failure
   before and after the row is written; refused or failed actions leave no row; owner/admin only, members
   and viewers 403; another organization never sees the log; keyset paging newest first with nothing
   skipped or repeated, filters by person and kind, bad cursor and bad kind refused; reading writes
   nothing) and 5 e2e tests (sentences newest first including a deleted project and issue; filters in the
   URL and after a reload; Load more across 30 rows; members have no link and get an explanation; phone
   width). Mutations caught: a row not written, the list not scoped by organization, members given the
   permission, a row written outside the transaction (this one first SURVIVED: the test only forced the audit
   insert to fail, so a second test forces the action to fail after its row was written), the sidebar link
   shown to everyone. Existing tests that called repository functions directly now pass a real user as the
   actor (the type system found all 14). **Not done:** retention or export, security events, a link from a row
   to the thing (it may be gone), rows for actions before this slice, live refresh of an open log, dark mode and
   a phone view looked at by eye.
   **Profiles: DONE 2026-10-03 (ADR 0028; slices 1 and 2 merged at the owner's request).** A job title, a
   bio (300 characters) and a photo on every person; `/profile` to edit your own, `/people/:userId` to see
   anyone in the organization (design P2: identity card left; About and Recent activity right); the hover
   card shows the photo and job title and links to the profile; the sidebar name opens your own. Photos are
   re-made on upload (decoded, rotated, centre-cropped to 256x256, WebP, metadata dropped; 5 MB in) and served
   from a public random-key URL with `immutable` caching. Migration 0022, new module `profiles`, `sharp`.
   Recent activity is the person's `issue_events` in this organization, ten at a time with Load more, each issue
   a link that opens the side panel on its project page; comment and description text is stripped from it.
   **Verified:** 18 new API tests (edit and blank-to-null, limits, login needed; the photo is a 256x256 WebP with
   the right headers, a text file named .png is refused, wrong type and over 5 MB refused, replace deletes the
   old file and URL, remove clears all three, unknown, malformed and orphaned keys 404; visibility for every role,
   other organization and removed members 404, malformed id 404; activity only that person's, newest first,
   paged, scoped to the organization, deleted issues gone, no comment or description text) and 7 e2e tests
   (edit shows on the profile, members list and sidebar; form errors; upload, load and remove a photo; wrong file
   refused client-side; another member reaches the profile from the hover card and opens an activity issue in the
   panel; unknown person; phone width). Mutations caught: profile lookup ignoring the organization, photo served
   without checking the key, old file not deleted on replace and on remove, activity returning everyone's events,
   activity ignoring the organization, comment text served. The phone test found a real bug (a long name or bio
   widened the page; fixed with `minmax(0, 1fr)` columns and `overflow-wrap: anywhere`, also on the page title).
   **Not done:** photos on the small assignee circles, a crop tool, changing your email, timezone or other fields.
   **Slice 3 DONE 2026-10-04:** the "Finish your profile" card on Projects (photo, title or bio missing and not
   dismissed), "Add photo" goes to `/profile`, "Not now" is stored on the account (migration 0023, ADR 0028
   amendment). 3 API tests (each of photo, title and bio hides it; clearing them brings it back; dismissal is
   permanent, idempotent and per person; login needed) and 2 e2e (dismiss survives a reload; Add photo then a photo
   hides it). Mutations caught: bio ignored, photo ignored, dismissal ignored, dismissal not saved. One
   unexplained single failure of `members-manage` (removed person invited back) in one full e2e run; it passed
   alone 3 times and in the next full run (96/96), so it is recorded as a possible flake, cause not found.
   **Small fixes DONE 2026-10-04 (owner's list, items 1 and 3-5):** a sprint row's buttons are three fixed slots
   (Rename, Start or Complete, Delete), so Rename sits in the same place on completed, active and planned sprints
   (it used to land elsewhere on the active row, which has no Delete); the three inline create forms (project,
   issue, sprint) no longer shift when a validation error appears (`Field reserveErrorSpace`, `FieldRowAction`).
   2 e2e tests (button positions across the three statuses; every label, input, button and the card keep the
   exact same box when Submit is pressed empty, on all three forms). Both fail when the fix is removed. A first
   version let a long message ("Key must be 2-10 characters") widen the narrow Key field; the test caught it and
   the message now takes no width. **Not done (owner's list, later):** reordering the backlog (a rank column,
   amends ADR 0008), and scrolling inside long board and sprint lists (design pass first). **Noted:** the create
   forms now keep about one line of empty space below the inputs even with no error.
   **Item 7 (profile back link) DONE 2026-10-04:** `PageHeader`'s `back` takes `history: true`; the profile's link
   goes back to the page you came from ("Back") and to Members only with no previous page (bookmark, new tab). The
   other back links were checked and left: the issue page's link to its project and Edit profile's link to your
   profile are parents, not history. 1 e2e test; it fails with the option removed.
   **Owner's open list, added 2026-10-04 (in the order we plan to take them, nothing started):**
   - **Readable URLs: DONE 2026-10-04 (ADR 0030; see the entry after this list).** keys instead of UUIDs: `/projects/WEB`,
     `/projects/WEB?issue=WEB-1` and the full issue page at `/projects/WEB/issues/WEB-1`. The API resolves a
     project or issue by key or by ID (organization-scoped), old ID links keep working and are rewritten, case is
     ignored, a deleted issue's number is never reused. One shared URL-builder function replaces the scattered
     link strings (cards, board, sprints, sidebar, notifications, search, command palette, profile activity,
     "Open full page"). e2e tests that match ID patterns need updating. The project key is immutable (ADR 0022).
   - **DONE 2026-10-04 (see the entry after this list). Reorder issues inside the sprints-page backlog and the active sprint:** today they are
     ordered by created time (ADR 0008 chose membership only). Recommended: a separate `backlog_rank` column
     (own migration and backfill, a move endpoint like the board's, sortable drag), which amends ADR 0008. Open
     questions: same for the active sprint? new issues at the top or the bottom of the backlog? does moving into a
     sprint keep the position or go to the end?
   - **Scroll inside long lists (needs a design pass):** the board columns and the sprints page lists grow the whole
     page. Plan: mock fixed-height-fill and capped-height columns on `/design-system`, probably fill on the board
     and a cap on the sprints page, with a capped Sprints list; check drag auto-scroll and phone width. Best taken
     together with the backlog reordering.
   **Backlog ordering and scrolling lanes DONE 2026-10-04 (owner's list items 2 and 6; ADR 0008 amended).** Both
   sprints-page lists are drag-sortable (new column `backlog_rank`, migration 0024; new issues go on top; completing a
   sprint puts its open issues on top in their order; reorders write a quiet `issue.reordered`; the Sprints list is
   newest first). The board and the sprints page fill the window and their columns scroll inside tinted lanes with a
   slim always-visible scrollbar; the board's drag logic moved to `shared/dnd/multiList` (BoardCard is now
   `SortableIssueCard`). **Verified:** 11 new API tests (374 in all, 8 mutations caught, one real bug found: halving a
   negative rank for "first place"), the migration backfill checked on dev data (313 issues, order kept, no
   duplicates), 5 new e2e tests (reorder in the backlog and in the sprint with real mouse drags, a drop between two
   cards across lists, lists scroll inside while the page does not, drag auto-scroll near the bottom edge) plus 1
   board test for the same-column path of the extracted logic. **Not done:** photos on assignee circles, multi-select
   drag, the readable URLs (still next on the list).
   **Motion DONE 2026-10-04 (owner's design-pass picks; ADR 0029).** Page fade-and-rise (by path only), staggered
   list loads, the issue panel slides in and out (no dim, by the owner's decision after trying it), dialogs fade and
   grow with a fading backdrop, the notifications dropdown fades and drops, rows open up with a flash on create and
   close up on delete, buttons press, show a spinner while a request runs and a tick when saved, in-place edit forms
   rise in, the theme cross-fades; all off under reduced motion, none delays an action. **Verified:** 15 e2e tests in
   `motion.spec.ts` (each animation, the reset key, the reduced-motion block), the whole e2e suite now runs under
   reduced motion and passes; mutation checks caught the page key, panel focus handling and the dialog exit. **Found
   by measuring:** a page-wide animation left attached (fill mode) slowed drags (p95 16.8 to 49.9ms); fixed with
   `backwards` fill. Drag frame times afterwards match the pre-motion figures within run-to-run variation (median
   16.7ms, p95 16.8ms; stalls of about 200 to 300ms at drag start and drop with 80 cards existed before too). Also
   fixed: the person hover card lost its hover delay under reduced motion. **Not done:** a true cross-fade between
   pages (needs React Router data mode), animating the board and sprints lanes, the search results.
   **Also 2026-10-04:** the Sort control no longer drops a line when the issue panel opens on a wide window (the
   filter row reserves room for the panel only below 1560px).
   - **Newest first on an issue DONE 2026-10-04 (owner's idea).** The whole Activity timeline (comments and activity
     lines together) reads newest at the top, "created this issue" last, and the comment box sits under the Activity
     heading, above the list. Only the screen order changed: the API still sends events oldest first (analytics and
     history rely on it) and `IssueDetail` reverses them before `useAnimatedList`, so a live arrival opens at the top.
     The page and the side panel share it. 2 e2e tests (`timeline-order.spec.ts`: order and box position on the page;
     live arrival from a second person in the panel); both fail when the reverse is removed. Named limit: no per-user
     toggle.
   **Scrolling lists DONE 2026-10-04 (owner's design pass).** "Load more" no longer stretches the page. The Issues page fills the
   window and its list scrolls in a raised panel (`ScrollPanel look="raised"`: outline and outer shadow; the owner tried a pressed-in version and did not like it; a short list keeps its own height);
   a person's Recent activity (capped at 28rem) and the full issue page's comments and activity (28 to 40rem tall since 2026-10-11, was capped at 32rem, comment box
   fixed above) scroll with edge shadows and a line (`look="edges"`, E3). The side panel's timeline is left alone (it already
   scrolls as a whole). Found on the way: `PersonHover`'s absolutely positioned card was clipped inside a scrolling list and made a
   short one scrollable, so it is now `position: fixed`. The owner then found no sign that the comments scroll (their bottom
   edge was below the fold) and the profile's Load more cut in half: both boxes are now also limited to the room left in the
   window (`fitWindow`), and Load more is a footer pinned inside the profile box. 7 e2e tests (`scroll-panels.spec.ts`); the cap, the fill-the-window
   page and the fixed card were each removed to see the tests fail. Not applied: the board and sprints lanes (own tinted
   `Lane`), the audit log's Load more (not asked). `/design-system` documents `ScrollPanel`.
   **Issue editor popup DONE 2026-10-05 (owner's pick A).** Edit opens a centered popup (new shared `Dialog`, a native modal
   dialog) from the issue list, the issue page and the side panel, instead of turning the row or the page into a form. With the
   side panel open the popup appears on top (the panel was already written to leave Esc and clicks to an open dialog); Esc closes only
   the popup. A click on the dimmed area closes it unless there is unsaved text. The description is a multi-line box (4.5rem to
   16rem, vertical resize only: now every `Textarea`), and the issue page keeps its line breaks. Conflicts (409) still close it
   with the existing notice. A known limit that was already true inline: the form's version follows live updates while its fields
   do not, so a change made by someone else in the meantime is overwritten rather than flagged. 6 e2e tests (`edit-popup.spec.ts`);
   three behaviours were removed one at a time to see them fail.
   **Dropdown DONE 2026-10-05 (owner's pick D4).** `shared/ui/Dropdown` replaces the browser's `<select>` everywhere (14 uses: the issue
   filters and sort, the issue editor, invite and member roles, the label picker, the audit log filters, the analytics ranges; the old
   `Select` component and its arrow token are deleted). A box like the other controls and a floating list with a mark before each label (status
   dot, priority icon, avatar), a search box past seven options, the chosen row in the link colour. Select-only combobox pattern (combobox, listbox,
   option, aria-selected, aria-activedescendant); Down/Up, Home/End, Enter/Space, type-ahead; Esc closes only the list (not the popup or panel
   behind it); `position: fixed` and flips upward when there is more room above; as wide as its widest option so a row of filters never jumps; forms
   use it through react-hook-form's `Controller`. `memberOptions` (entities/member) builds the people lists. The e2e suite's 27 `selectOption` calls
   became a `pick` helper (`e2e/support/dropdown.ts`); 6 new tests (`dropdown.spec.ts`) and 5 behaviours removed one at a time to see them fail.
   Named limits: the list is not virtualised (fine for the longest list here, the members); no multi-select (the label picker adds one at a
   time, as before); a screen reader was not run, the semantics follow the pattern.
   **Drag stalls FIXED 2026-10-05.** Measured with 80 cards (frame timing and long tasks during a real mouse drag, dev build): a 200 to
   280 ms main-thread stall at the start and at the drop, because dnd-kit re-renders EVERY sortable item on every drag-over event (2,100 to
   2,750 card renders per drag). Two causes, both fixed: the card body is now memoised (only a thin `<li>` follows dnd-kit; the cards take
   `assigneeId` plus a stable `renderAssignee` instead of a ready-made element, and `useDragClickGuard` returns a stable function), and the
   sensors' options were inline objects, new on every page render, which made dnd-kit rebuild every card's pointer listeners (now constants in
   `shared/dnd/sensors.ts`, shared by the board and the sprints page). Result: 22 to 168 card renders per drag, longest stall about 70 ms,
   worst frame 233 to 50 ms. `drag-performance.spec.ts` fails above 150 ms; with the sensors inline it measured 190 ms and with the memo
   removed 249 ms. Not changed: the remaining ~70 ms (the first render at drag start); the median frame was already 16.7 ms, so the drag itself
   never stuttered, only its start and end.
   **Status check 2026-10-05 (everything still open, so nothing is assumed done).** Checked in the code and in the running app. Open product
   items: due dates; Markdown and @mentions. Open leftovers named earlier: the issue editor now WARNS when someone else changes the issue while its popup is open (it still
   overwrites on Save; owner's choice); no audit log retention (the export is done, below). Not verified: WebKit/Safari, a real
   screen reader (the owner does not need it), and the cause of one full e2e run with 8 unrelated failures that has not repeated. Every other
   slice listed above is done. Phase 9 has not started except the e2e suite.
   **Three small items DONE 2026-10-05.** (1) `C` focuses the new-issue title on the issues page: a shared `useShortcut` hook that never steals a
   letter (not while typing in a field or a dropdown, not with Ctrl/Cmd/Alt, not with a dialog open or focus inside one, so not with the issue
   panel focused); `CreateIssueForm` exposes `focus()` through a ref. (2) The sort offers "Lowest priority first" (`?sort=priority&order=asc`;
   the API flips the whole key, so issues without a priority come first, then low to urgent, oldest first within each; going back to Highest
   drops `order`). (3) The audit log's rows scroll inside a raised panel capped to the room in the window, with Load more pinned as its
   footer (same as the issues list and the profile). 3 e2e tests (`quick-wins.spec.ts`); each guard was removed one at a time to see them fail
   (the field, dialog and modifier guards, the sort mapping, the panel cap). Not done: a visible hint for `C` (the title field has
   `aria-keyshortcuts="c"`, nothing on screen).
   **"My work" home DONE 2026-10-05 (owner's pick: layout C of three, in the design system).** `/` is now a page instead of a redirect: "Assigned to me"
   (my open issues across all projects, newest change first, up to 10, with the real count and the project named on each row) and "Unread
   notifications" (the bell's own list, up to 5, click opens the issue and marks it read, Mark all read). New endpoint
   `GET /organizations/:id/my-work/issues?limit=` (own module `my-work`: any member, scoped by the project's organization and by the caller's
   id, "open" is not done); sidebar link "My work" first and the logo goes there. A login now lands on My work (it lands on `/`, which used to
   bounce to /projects): the e2e fixture still takes its page to /projects afterwards, because most specs start there. 4 API tests (mine across
   projects and nobody else's, a viewer can read it and signed-out cannot, another organization never appears even for a person in both (this
   needed a person in both: the first version of that test was too weak), limit/total) and 5 e2e tests; the person filter, the organization
   scope and the done filter were each removed to see the API tests fail. Named limits: the assigned list is re-read when the page opens, not live;
   the notifications section has no activity feed (that was layout A/B, not chosen).
   **Labels on cards and a multi-label filter DONE 2026-10-05 (owner's pick: pills, click to filter, several at once).** The issue LIST now
   carries each issue's labels (`labels: [{id, name, color}]`, one extra query per page; this reverses the old Phase 3 decision "labels are not
   embedded in the list", for the list only: every other endpoint still returns the plain issue) and accepts `?label=<id>` repeated: an issue must
   have ALL the chosen labels (my reading of "choose many labels together"; changing it to "any" is the one `HAVING` clause in
   `listByProject`). Repeating the same id counts once (found by a test: it returned nothing). New index `issue_labels_label_id_issue_id_idx` (migration
   0025) for the filter's lookup by label; not measured at 20,000 issues. Web: up to three pills under each card then "+n" (they are buttons:
   click to choose, again to remove, the chosen ones ringed), a "Label" multi-select dropdown in the filter row (the dropdown gained a
   `multiple` mode: stays open, checks, summary "bug +1", Clear selection), the choice lives in the address (`?label=...&label=...`, a
   non-id is ignored), the issue page and panel show the labels, and adding a label in the editor updates the card at once. 4 API tests and 6 e2e
   tests; removed to see them fail: the filter not being sent, a click replacing instead of adding, the card not refreshing after the picker adds
   a label, the list closing after each choice, ANY instead of ALL, no de-duplication, no labels embedded. Not done: pills on the board and
   sprints cards (the filter exists only on the issues list); label colours are the label's own, so a very light colour is hard to read under
   white text (as in the editor today).
   **Account page DONE 2026-10-05 (ADR 0031; owner's picks: a separate private page, confirm the new address first, other devices signed out).**
   `/account` (from Edit profile) with three sections. EMAIL: new address plus current password, a confirmation link to the NEW address and a notice
   to the old one, the email changes only when the link is opened (`/confirm-email-change`), single use, 24 hours, a newer request retires older
   ones, the address is re-checked at confirmation. PASSWORD: current plus new typed twice, the other sessions are signed out and this one kept
   (found through the refresh cookie, so the route is `/auth/change-password`), a notice is emailed, a link to the existing "forgot password"
   flow. TIMEZONE: a searchable list with "Browser setting" first, saved at once, shown as the current time there, used for the exact time on hover
   over a relative time (that is the only place it changes anything today; it is there for due dates later). New columns `users.timezone`,
   `auth_tokens.new_email` and token purpose `email_change` (migration 0026). 8 API tests (`auth.account.http.test.ts`) and 5 e2e tests
   (`account.spec.ts`); removed one at a time to see tests fail: keeping the other sessions, not checking the current password, not retiring a used
   link, not validating the zone, the time ignoring the zone, the session not carrying the zone. Found on the way: the dropdown's list closed the
   instant it opened when the PAGE was scrollable (focusing the search box and `scrollIntoView` scroll the page, and a page scroll closes the list), so
   both now scroll only the list, and the list ignores scrolls for the first 150 ms. Not done: the emails are not delivered in tests (the tests
   make the token themselves), changing the email does not sign other sessions out, no "sign out everywhere" button (the API for it exists).
   One API test run right after generating the migration failed in several tests with database errors (the table reset itself failed) and did
   not repeat in 5 later runs; the cause is unknown.
   **Bug fixed 2026-10-05 (found by the owner): removing a label in the editor closed it.** The pill's X was a button without `type`, which
   inside the editor's form is a submit button: it removed the label AND saved the form, so the popup closed. Now `type="button"` in `LabelBadge`
   (the only bare `<button>` in a form; the others are the shared Button, which sets its type, and the search palette, which is not in a form).
   1 e2e test (removing a label keeps the editor open and what was typed unsaved; it fails without the fix); checked in the running app with
   the delete request blocked: the form no longer submits.
   **Design-system cleanup 2026-10-05.** Removed the draft sections that simulated pages or compared options (My work home, Labels on cards,
   Concurrent edit, the empty Page and PageHeader note, the Navigation shell preview) and their helpers: the real pages exist now and the choices
   are recorded here. Added "Label pills and multi-select". 1,012 lines became 725; the one test that reads the page (Button hover colours) still passes.
   **Audit log CSV export DONE 2026-10-05. An "Export CSV" button on the audit log page (owners and admins, like the log itself) downloads the
   rows that match the person and kind filters, newest first: `GET /organizations/:id/audit-events/export` (same `view_audit_log` permission,
   same organization scoping), columns `time, who, action, target_type, target, details` (raw fields; `details` is JSON, the web page's
   sentence is not duplicated on the server), capped at 10,000 rows with a last line saying so when there were more (`AUDIT_EXPORT_MAX_ROWS` in
   contracts). CRLF line ends and a UTF-8 byte order mark so Excel reads accents; a cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage
   return gets an apostrophe in front (spreadsheet formula injection: names are typed by people). The browser fetches with the access token and
   saves the Blob (`apiDownload` and `saveBlob` in `shared/api/client.ts`), because a plain link cannot send the header. 7 API tests
   (`audit-export.http.test.ts`: the file and its order, a member and a signed-out request refused, another organization's rows and address
   refused, filters and bad filters, formula and quote handling, the CSV helpers, the cap) and 2 e2e tests (the download with and without a
   filter; no button for a member). Removed one at a time to see tests fail: the permission check, the organization scope, the formula prefix,
   the truncation flag, and the filters in the button. Not done: retention (deleting old rows is a policy decision, deliberately left open);
   the export was not clicked in the owner's running app (the browser tool's session was logged out): checked in the clean test browser.
   **Concurrent edit: WARNING DONE 2026-10-05 (owner chose option C of three in the design system).** While the editor popup is open, a banner
   names the fields someone else changed ("title, status") and says Saving will overwrite their change. Nothing is merged and Save still resends
   what it always did; A (merge untouched fields, send only what you changed) and B (block Save) were not chosen and are in `/design-system` as
   the alternatives. The banner compares the issue as the popup opened with it against the live one (title, description, status, priority,
   assignee; labels are not watched). Who changed it is not shown ("Someone"; the form does not know). 1 e2e test; removing the banner fails it.
   Checked in a clean browser only: triggering it in your dev data would have meant editing a real issue.
   **Two more small items DONE 2026-10-05.** (1) A small `C` key badge sits inside the empty, unfocused Title field of the new-issue form: it
   disappears on focus or when text is typed, is not shown on a phone, and is hidden from assistive tech (the field has `aria-keyshortcuts`).
   Its wrapper briefly made the field narrower than Description (caught by looking, now a test). (2) The label picker stays open after a choice
   (`Dropdown` has a `keepOpen` prop), so several labels go on in one go; each chosen label leaves the list and Esc closes it. Tests in
   `quick-wins.spec.ts` and `dropdown.spec.ts`, each behaviour removed once to see them fail; checked in the running app (the badge, and the
   picker opening with the editor's labels) without adding labels to dev data.
   **Assignee photos DONE 2026-10-05 (owner's request).** The small circle on an issue card (list, board, sprints) shows the assignee's photo
   (initials without one) and, like every other picture of a person, opens the person card on hover and goes to the profile on click. It sits
   BESIDE the card's issue link, not inside it (a link cannot hold a link): `IssueCard` and `SortableIssueCard` take an `assignee` node built by
   the page from `entities/member`'s new `AssigneeAvatar` (entities cannot import each other); `IssueSummary` shows a plain one for the drag
   overlay. 3 e2e tests (`assignee-photo.spec.ts`: photo, link, hover card kept inside the window, title still opens the panel; board drag from
   the circle; a drag ending on the circle does not open the profile). Found on the way: `PersonHover`'s card ran off the right edge of the
   window for a name or picture at the right end of a row, so it is now held inside the window (removing that put the card 130px outside it).
   Not proven necessary, kept anyway: `draggable={false}` on the profile link (dnd-kit already cancels a native link drag). An extra click
   guard on the circle was removed: the drag overlay is under the pointer, so the click after a drag never lands on it.
   **Verified 2026-10-05 (the items marked unverified before):** the dropdown's accessibility tree (Playwright aria snapshot: combobox, listbox,
   options, aria-selected, aria-activedescendant pointing at a real option) which found the label picker's box had no name (fixed, with a test);
   dark mode on the raised list, the timeline edges and both dropdowns (looked at; the edge line is faint in dark); Firefox 155 (the dialog fades
   in, the dropdown and Esc behave, the edit flow works); the concurrent-edit overwrite really happens (a save after someone else's title change
   put the old title back); type-ahead and search each fail a test when removed. "No priority" no longer carries a blank mark that indented it.
   **Still not verified:** a real screen reader, WebKit/Safari, and the cause of the one full e2e run that had 8 unrelated failures.
   **Readable URLs DONE 2026-10-04 (ADR 0030).** Projects and issues are named by their keys in the address:
   `/projects/WEB`, `/projects/WEB/issues/WEB-12`, `/projects/WEB?issue=WEB-12`. New endpoint
   `GET .../issues/by-number/:number`; a `ProjectRoute` layout resolves the key once from the cached project list and the
   project pages lost their own id, loading and not-found code; `IssueByKey` resolves an issue before `IssueDetail`
   (which still works on ids); one set of address builders (`shared/lib/paths.ts`); old addresses with ids and lowercase
   keys still open and are rewritten. **Verified:** 6 API tests (by number, deleted numbers never reused, per-project
   scope, tenant isolation, junk input is 404, viewer may read; 2 mutations caught), 6 new e2e tests (every project page
   by key, the panel and Open full page, old addresses rewritten, not-found for project, number and wrong prefix in page
   and panel, no link on the main pages carries an id, the palette; 2 mutations caught) and the 10 existing e2e tests
   that asserted ids were updated. **Not done:** nothing planned; the sockets, query keys and API still use ids.
10. **Larger ideas, unscheduled:** project-level activity feed, a burndown chart
   from the stored events, sprint dates and progress on the sprint card, saved
   filters and views.

**Done when** (for the phase) a two-person team can invite each other, assign and
prioritise work, discuss it with edits and files, and see when things happened.

---

## Phase 9 — Production

### THE PLAN (decided 2026-10-07, ADR 0045): free hosting on Render, database on Neon, files on Cloudflare R2

The checklist further down keeps the detailed notes of each item; **this plan sets the ORDER and the "done when" of each slice.** One vertical slice at a time, tests inside each slice, the owner commits.
Who does what: **the owner** creates the accounts, pushes to GitHub and pastes secrets into the hosts' dashboards (secrets never go through the chat); **the assistant** writes the code, the configuration files and the tests, and says what it could not check.

**What the free setup is (and is not):** one Render web service serves the built web app and the API on one `*.onrender.com` address (free HTTPS, no domain needed). It sleeps after 15 quiet minutes and wakes in 30-60 s; it has 512 MB RAM and 0.1 CPU; it has no disk that survives a restart; Neon sleeps after 5 idle minutes; email to other people waits for a domain. Not checked: whether Render needs a card at sign-up.

- [x] **9.0 Housekeeping (small). DONE 2026-10-07 (with 9.1).** Fix the two known test problems (the motion test that matches the comment box; the session-renewal assertion that matches four elements), run the 21 tests the last wide run skipped, commit. *Done when:* the API suite and the whole e2e suite are green. **Result:** both test problems fixed (the motion test now waits for the posted comment row; the session-renewal test looks inside the page's main area); each passed 3 runs in a row; the full API suite and the whole e2e suite were rerun at the end of the slice (numbers: API suite 50 files / 492 tests, whole e2e suite 262 tests in 17.4 minutes, production smoke 4 tests: all green. One API run took 33 minutes instead of about 4 and had one 10-second timeout in a database clean-up step; the rerun took 234 s and passed, and the cause of the slow run was not found.)
- [x] **9.1 Make the server production-ready (one process serves everything). DONE 2026-10-07 (ADR 0046).** `trust proxy` (so rate limits see the visitor, not Render's proxy); the API serves `apps/web/dist` with a fallback to `index.html` for non-API paths (hashed assets cached for a year, `index.html` never cached); **migrations run when the server starts** (Render's pre-deploy command is not on the free plan), under a database lock; a clean shutdown on SIGTERM (close the server and the pool); production security headers; `/api/health` stays the health check and does not touch the database (so a ping does not wake Neon). *Test:* build everything, start in production mode on one port, load the landing page, log in, create an issue. *Done when:* `pnpm build` and one `node` command run the whole app on one port. **Result:** the API serves the built web app (`SERVE_WEB`), `TRUST_PROXY`, migrations at start (`RUN_MIGRATIONS`, under a lock), a clean stop, helmet with a strict CSP (scripts by hash, no eval), a JSON 404 for unknown API addresses; `vite build` now writes to `apps/web/build`. **Found on the way:** a Windows-1252 byte in `ProfilePage.tsx` that the production bundler refused (also a broken character in the browser), and Zod's `new Function` probe tripping the policy (fixed with `jitless`). New: 19 API tests (3 mutation checks caught) and `pnpm test:e2e:prod` (4 tests: the BUILT app run like Render will, rate limiters on). **Not verified:** Render's real SIGTERM behaviour and proxy headers, Safari/Firefox under the policy. The bundle is one 1.2 MB script (not split yet).
- ~~**9.2 Docker.**~~ **SKIPPED (owner, 2026-10-07): not needed.** Render builds and runs the Node app directly (build command and start command), so there is no Dockerfile or compose file in this phase. CI starts its own Postgres service and the file-storage tests use a fake S3 inside the test. If Docker is wanted later (a portable image, a one-command production-like run locally, an interview talking point), it is its own slice then; the owner will ask.
- [~] **9.3 CI (GitHub Actions). WRITTEN 2026-10-07, NOT YET RUN ON GITHUB (ADR 0047).** Remaining for the owner: push the repository, watch the first run, then require the four checks in Settings, Branches. Needs the repository on GitHub (the owner pushes). Jobs: lint and typecheck; API tests against a Postgres service; build; Playwright e2e as its own job; pnpm cache; failing checks block merging. Finish with the "speed up the e2e suite" notes below. *Done when:* a pull request shows four green checks. **Result so far:** `.github/workflows/ci.yml` with check, api-tests, build-and-smoke and e2e (4 shards, each with its own Postgres). Valid YAML; the commands were run from a clean copy of the tracked files with no .env: install with the frozen lockfile, typecheck, lint, contracts build, the API suite (50 files, 492 tests, 229 s), `pnpm test:e2e:prod` (4 tests) and e2e shard 1 of 4 (66 tests, 4.8 min on this machine). **Not verified:** GitHub itself running it, the real wall time, memory on its machines. A pnpm error seen only in a very deep Windows folder (path too long) is not a workflow problem. **First run on GitHub (2026-10-07):** 6 of 7 jobs green; browser shard 1 failed one test (`account.spec.ts:15`), the Log in page showing after a reload. The trace showed a refresh cancelled in flight by the next navigation, then a 401 on the next refresh: reuse detection read a refresh that raced itself as theft, a real bug (a slow server makes it likely for real users). Fixed with a 10 second grace window (ADR 0048, 4 new tests, 3 mutation checks caught). **Still to prove:** shard 1 green on GitHub, re-run a few times.
- [x] **9.4 First deploy (uploads switched off). DONE 2026-10-08 (ADR 0049): live at https://flowdesk-yotg.onrender.com (Render free, Frankfurt; Neon free, Frankfurt).** The migrations ran on Neon from empty, the owner's browser smoke test passed (demo, board, live update, register, log in); no emails, as designed. The service was made by hand in the dashboard, not from the Blueprint (the Blueprint flow asked for a card first); `render.yaml` is the record of the settings. **Found after the deploy:** the request log printed tokens and cookies (fixed, ADR 0050; redeploy needed to apply it live). **Proxy chain measured and fixed:** the live `x-forwarded-for` has three addresses, so `TRUST_PROXY` is now 3, not 1 (ADR 0051); verified live with two networks (the login limit counted separately). **Still open after this slice:** the cold start after sleep, email. **The card was removed from the Render account on 2026-10-08** (the site stayed up 20+ minutes afterwards; Render then blocks adding a card until 2026-11-01, so no paid service can be created before then); check once more that the free service is still Live a day later. Code half and checks, as built: Done: `render.yaml`, `APP_URL` from `RENDER_EXTERNAL_URL`, `STORAGE_DRIVER=disabled` (503 `uploads_disabled` for attachments and photos), pool limits and a pool error listener (an idle connection closed by Neon no longer stops the server), 15 new API tests (3 mutation checks caught). Run from a clean copy: `pnpm install --frozen-lockfile` and `pnpm build`, then the built server with the Render settings against the local test database: health 200, the landing page with its security header, register and login, and an upload refused with 503. Neon: project `flowdesk` (Frankfurt, free plan), the direct connection string was checked with `select 1`. **Not verified:** Render itself (its native build of this pnpm workspace, `corepack enable`, memory on 512 MB, the proxy headers), Neon waking from suspend, and migrations on Neon. Original plan text follows. Owner: a Neon project (use the DIRECT connection string, not the pooled one: pooled connections can break migrations, not checked), a Render account, a Render Blueprint from `render.yaml` (Node runtime, plan free, health check `/api/health`; the exact build and start commands for the pnpm workspace are worked out and tested here, and whether Render's native build handles the workspace was NOT checked: Docker comes back only if it fights us). Assistant: `render.yaml`; make sure the database client works over TLS and caps its pool (Neon's free connection limit was not checked); the environment list (`NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET`, `ATTACHMENT_SIGNING_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL` = the Render address, `STORAGE_DRIVER=disabled`, `DEMO_ENABLED` on purpose, no `OAUTH_FAKE`). *Smoke test, by hand and then by a read-only script:* the landing page after a cold start, register, log in, create an issue, a live update in two tabs, drag on the board, Try the demo, log out. *Done when:* the public address works end to end and a redeploy keeps the data.
- [x] **9.5 Files in an S3-compatible bucket. DONE 2026-10-09 (ADR 0053), checked live by the owner: Neon Object Storage (Frankfurt, bucket `flowdesk-files`) instead of R2.** Built: a disk store and an S3 store behind `lib/storage.ts` (`STORAGE_DRIVER=local|s3|disabled`, five `S3_*` values), our signed download links and range requests unchanged, `readFileStream` async. Tests: one set of checks on both stores, a fake S3 inside the test, HTTP tests with the s3 driver, config tests; three mutation checks caught. **Live:** the owner set `STORAGE_DRIVER=s3` and the five values in Render. The first try failed with `400 InvalidArgument` because the bucket was entered as `flowdesk_files` (underscore) instead of `flowdesk-files`; after the fix the owner reported that all four live checks work: a profile photo upload, an issue attachment, a video with seeking, and the same files still loading after a redeploy (owner-reported, not watched by me; no details of the video or file sizes were given). **Still unconfirmed:** Neon's free limits and beta status. **Open small item:** a storage failure shows the visitor the generic "Something went wrong"; a clearer 503 is not built (owner's call). Original plan: **Files on Cloudflare R2.** An S3-compatible adapter behind `lib/storage.ts` (`STORAGE_DRIVER=local|s3|disabled`): our signed download links stay, the server reads the object and streams it, **including Range requests** (video seeking, ADR 0023); avatars the same way. Owner: an R2 bucket and keys (whether R2 needs a payment method was not checked; if it does, uploads simply stay off). *Tests:* the adapter against a fake S3 that runs inside the test (no Docker); the existing upload tests unchanged. *Done when:* attachments and photos survive a redeploy.
- [ ] **9.6 Email and background jobs.** An email sender with `log` (links in the logs), `resend` and a fake for tests; `resend` only reaches the owner's own address until a domain is verified (SPF and DKIM). Jobs: demo clean-up and digests; on a sleeping free instance a timer does not run while it sleeps, so jobs run on wake and on demand until the plan is paid. **"Try the demo behind an email" (see below) waits for a domain.**
- [x] **9.7 Real Google and GitHub sign-in. DONE 2026-10-09 (owner-tested; ADR 0042 amended).** Both apps exist (GitHub OAuth App; Google Cloud project `flowdesk`, consent screen in Testing mode with named test users, no billing or trial needed) and their ids and secrets are in Render's environment. No code change was needed. I saw the live `/api/v1/auth/oauth/providers` answer `["google","github"]`; the owner then tried the sign-ins on the live site and reported "working as expected" (which of the five cases were run was not itemised, and I did not watch them). **Still open:** whether GitHub enforces PKCE (unchecked), the smoother landing after a provider sign-in (still a full page load, so it cuts), Google's app verification before anyone outside the test-user list can sign in, and both apps' redirect URLs must change when the address does. Original plan: Create both apps with redirect URLs on the Render address (`/api/v1/auth/oauth/<provider>/callback`), put the credentials in Render, remove `OAUTH_FAKE`, try every case once for real, check whether GitHub enforces PKCE, and smooth the landing after a provider sign-in (notes in the OAuth item below).
- [ ] **9.8 Redis: deliberately skipped on the free plan.** One instance keeps the in-memory design correct. Add Redis (shared rate limits, Socket.IO adapter) the day there is a second instance.
- [~] **9.9 Ready to show. BUILT 2026-10-09, waiting on a few owner steps (ADR 0054, 0055).** Done: the security pass (`docs/security.md`: 7 of 8 dev-tool audit findings pinned to patched versions, `braces` has no patch, production audit clean, a clean search of the public history for secrets, live read-only header and endpoint checks, a fix for a timing leak in the password reset); a read-only smoke tool (`apps/api/src/tools/smoke-live.ts`, 7 tests, run once against the live site: 12 of 12 checks passed); a daily uptime workflow using that tool (one request a day, so the no-keep-alive decision stands); a weekly encrypted database backup workflow with restore steps (`docs/backups.md`; the dump, check, encrypt and decrypt chain was run locally); optional server-side Sentry error tracking (off without `SENTRY_DSN`; 6 tests and 3 mutation checks); and the README. **Needs the owner:** repository secrets `DATABASE_URL` and `BACKUP_PASSPHRASE` and one manual run of the Backup workflow; a free Sentry account and its DSN in Render if error tracking is wanted; the dashboard checklist in `docs/security.md`. **Licence decided 2026-10-09: all rights reserved** (`LICENSE`; the owner does not want the code copied; the repository stays public so it can be read). **Update 2026-10-09:** the owner added the two secrets and ran the Uptime and Backup workflows by hand; both reported green (owner-reported). **Not verified:** a scheduled (not manual) run of either, Sentry receiving a real event, a restore into a real database, browser-side error tracking (not built). Original plan: **Ready to show.** A README (what it is, a screenshot, how to run it, how it is deployed, the decisions list), an uptime check, error tracking and a weekly `pg_dump` backup routine (free services for these were not checked), a security pass, a dependency audit, secrets rotation notes, and a read-only smoke run against the public address. *Done when:* a stranger can open the address, try the demo and read how it was built.

**Decided: no Docker for now.**

**Decisions made 2026-10-08 (after the first deploy):**
- **No keep-alive pings.** The free server is allowed to sleep. A ping every 14 minutes would run it around the clock and use up almost all of the 750 free hours a month (a month has about 744), and it would hide the cold start instead of facing it. Revisit only if the cold start (measured, see 9.4) turns out to be a real problem for visitors; the alternative is a friendlier "waking up" state in the page.
- **Render deploys only after CI is green: later, once CI is stable.** The option is "After CI Checks Pass" in the service's Settings (the docs support GitHub Actions; whether it works on a free service is not stated). Catch: if any check fails for a commit, Render deploys nothing for it, so a flaky red check blocks the deploy until it is re-run. Turn it on after CI has been green for a good stretch (the browser shards were flaky in the first runs).
- **Required checks and pull requests on GitHub: at the very end.** Require the 7 checks (Lint and typecheck, API tests, Production build and smoke test, Browser tests shards 1 to 4) in Settings > Branches only when everything else is done; it forces a branch and pull request workflow.
- **Update 2026-10-09: the free `is-a.dev` route is closed for now.** The owner prepared `domains/flowdesk.json` in a fork, but GitHub would not let them open the pull request: the repository's front page says "PULL REQUESTS ARE DISABLED UNTIL FURTHER NOTICE" (no reason or date given; it points to a Discord server for announcements, not checked). The owner chose to skip the address for now and come back when email (9.6) needs a domain: either `is-a.dev` has reopened, another free service (`js.org`, `eu.org`: not read), or a bought domain.
- **A nicer address: yes, wanted** (also needed before email to other people works). Two ways, to decide when it is started: a free `is-a.dev` subdomain (register it with a pull request to their `register` repository; point it at the Render service with a CNAME and add it as a custom domain in Render; email records would need a sub-subdomain because a CNAME cannot share a name with MX or TXT records; whether `is-a.dev` allows that, and whether it accepts email use, is not verified), or a bought domain (the sure route, roughly 10 dollars a year, price not checked). When the address changes, set `APP_URL` in Render (it overrides the automatic `RENDER_EXTERNAL_URL`), update the redirect URLs of the Google and GitHub sign-in apps, and re-measure `TRUST_PROXY` (ADR 0051: the hop count may differ behind a custom domain).

**Small changes 2026-10-09 (found by the owner on the live site):** after logging out, Home and the brand link now reach the landing page (the "signed-out" memory was never cleared, so `/` bounced back to `/login`); logging out and returning from Google or GitHub now cross-fade (ADR 0029 amended); the guided tour starts by itself on a person's first visit (ADR 0052, migration 0030).

**Formatted comments (owner's idea 2026-10-09, ADR 0056). BUILT 2026-10-10, to be confirmed by CI.** Bold, italic, strikethrough, code, links and lists in comments, with a toolbar and keyboard shortcuts (Ctrl+Shift+K for the link, since Ctrl+K is the search palette). Owner chose the "formatted while you type" editor (TipTap) and the same editor for issue descriptions later (not built). Stored as a small Markdown subset in the same field (no schema change). Slice 1 (a shared safe reader and drawing on the card), slices 2 to 4 (the editor, used in the comment box and in editing a comment, loaded on demand; the old text box deleted; the `/design-system` page now shows the real editor). Two bugs found on the way are fixed: the search palette also opened on Ctrl+Shift+K, and the person hover card could open below the window edge. **Not completed locally:** a final full run of the API and whole browser suites and the production smoke test (left to CI); not reviewed by me: the editor's look and feel, dark mode, phones, Safari and Firefox. **Still to do:** issue descriptions in the same editor; measure whether any real old comment now shows formatting it should not.

**Small fix 2026-10-10:** the side panel no longer closes when a text selection started inside it is released over the page (ADR 0025 amended).

**Dark theme lifted 2026-10-10 (ADR 0017 amended):** the owner found it too dark; chose option A, soft charcoal (still neutral gray, page and cards one step lighter, the sidebar darker than the page, chart grid lines moved so they stay visible). Light theme unchanged.

**Decisions still open:** whether R2 is acceptable if it asks for a card (Neon Object Storage is tried first for 9.5).


- [ ] **Make Google and GitHub sign-in real (ADR 0042; the code is built and tested with a fake, never run against the real providers).**
  Steps, in order: (1) create a Google Cloud OAuth client (type "Web application", consent screen in Testing mode with your Gmail as a test user) and a
  GitHub OAuth App; (2) register the redirect URLs `{APP_URL}/api/v1/auth/oauth/google/callback` and `.../github/callback` (for local dev
  `http://localhost:5173`, and again for the real production domain); (3) put the ids and secrets in the environment (`apps/api/.env`, and the
  secret store of wherever it is deployed, never the repo); (4) remove `OAUTH_FAKE=true` from `.env`; (5) try both providers once for real: a new
  account, a second sign-in, connect and disconnect on `/account`, and a cancel at the provider's page; (6) check whether GitHub enforces the PKCE
  parameters we send; (7) for production: publish the Google consent screen (or keep named test users), use HTTPS so the Secure cookies work, and
  add a rate-limit store that is shared between instances (Redis item below), since the OAuth limiter is in memory. Also decide then: OAuth inside the
  invitation flow, and choosing the organization name at provider sign-up.
  **Also (owner, 2026-10-06): smooth the landing after a Google/GitHub sign-in.** A password login now cross-fades into the app (ADR 0029, `withViewTransition`),
  but a provider sign-in is a full page load (the browser leaves for the provider and comes back to `/`), so it still cuts. Options to look at then: a short
  fade-in on the first paint after a provider sign-in (a `?welcome` marker or a flag set before leaving), or cross-document view transitions where the
  browsers support them. Check it with the real providers, not the fake.
- [ ] **"Try the demo" behind an email, when we go live (owner, 2026-10-07; builds on ADR 0044).** Today one click starts a demo. Live, the visitor should first give an email address, and the owner should see who asked.
  Recommended shape: (1) the button opens a small form (email + one line saying what it is used for); (2) the server stores a `demo_requests` row (email lowercased, time, how many times asked) and sends the VISITOR a single-use link that expires in about 30 minutes: opening it proves the
  address is theirs and only then starts the demo (`/demo/start` takes the link's token, so the endpoint can no longer be called without one); (3) the owner gets a notice at a support mailbox (`DEMO_NOTIFY_EMAIL`) with the email and the time, or a daily digest if it is noisy. A flag (`DEMO_REQUIRE_EMAIL`) keeps development instant.
  Needs, in order: the real email sending of the "background jobs + transactional email" item below (a fake sender in tests); a verified sending domain (SPF and DKIM, otherwise the link lands in spam: not checked); limits per address (about 3 a day) and per IP, plus a bot guard (a hidden field or a captcha), because this turns a public button
  into a public "send an email to any address" endpoint (the existing demo limits from ADR 0044 stay); a short privacy notice and a retention rule for the stored addresses (what they are for, how long they are kept, how someone asks for deletion: whether the law of the visitor's country requires more is NOT checked, ask someone who knows before launch);
  an owner view (the support inbox is enough at first, a small admin page later). Trade-off to accept: asking for an email loses some visitors who would have clicked once; the gain is knowing who tried it and reaching them. No marketing mail without separate consent: this is a one-time link, not a newsletter.
  Tests then: no token, no demo; an expired or reused link is refused; the owner notice is sent once per request; the limits and the bot guard answer 429; a fake sender asserts the visitor's email was requested; development with the flag off still starts at once.
- [ ] Demo follow-ups from ADR 0044: a scheduled job that deletes expired demo copies (today they are deleted when the next demo starts), and a limiter shared between servers (Redis) so the demo's per-address limit survives restarts.
- ~~Docker + docker-compose (api, web, postgres, redis)~~ **Skipped for now (owner, 2026-10-07; see 9.2 in the plan above).** Redis is skipped on the free plan too (9.8).
- [ ] Redis: caching, rate limits, Socket.IO adapter
- [ ] Background jobs + transactional email
  - Note (owner deferred, 2026-09-30): API tests that register users call
    the real Resend API with the real key from `.env` (no fake in
    `src/lib/email.ts`); Resend rejects the `example.com` test addresses, so
    nothing is delivered and tests still pass. Fix when this item is done:
    fake the email sender in the test setup, so tests need no network and
    can assert "a verification email was requested".
- [ ] GitHub Actions: lint → typecheck → test → build
  - **Speed up the e2e suite (noted 2026-10-05, owner agreed to do it with this item).** A full run takes about 10 minutes
    (about 150 tests, one at a time: all tests share one database that is reset before each test, `workers: 1` in
    `e2e/playwright.config.ts`). Options, in the order I would try them: (1) 3 or 4 workers, each with its own database and its own api and
    web ports (roughly a third or quarter of the time; real work, because the reset, the seed and the servers are all shared today);
    (2) the full suite only in CI, and a small smoke set in the pre-push hook (the decision already noted under the e2e item below);
    (3) look for the slowest tests and trim their waits (not measured yet: start with `--reporter=list` timings). Until then,
    run only the specs of the area you changed (under a minute) and the full suite once at the end of a slice.
- [ ] Playwright e2e on 3–4 critical flows
  - **Started 2026-10-01 (ADR 0020), pulled ahead of Phase 9 by the owner's choice:**
    setup plus 6 tests are in `e2e/` (register through the form and log in, wrong
    password, stay logged in after a reload, create a project and issue then post,
    edit and delete a comment, drag a card between board columns and see it persist
    after a reload, and a second person seeing a comment, edit and delete live in a
    separate browser context). Runs in about 21 s with `pnpm test:e2e`.
    **Verified:** all 4 pass; a run leaves dev data untouched (dev row counts
    identical before and after: 18 users, 314 issues, 15 comments) and writes to
    `flowdesk_test`; four mutation checks: hiding "(edited)" fails the comment test,
    a wrong refresh path fails the reload test, removing the card's pointer
    listeners fails the drag test, and removing the server broadcast after a comment
    edit fails the live test. **Noted:** the reload test passes here, so the earlier
    manual 401 on reload was not reproduced; its cause is still unknown. The e2e API
    runs with `NODE_ENV=test` (first tried `development`; the register limit of 5
    per hour gave a 429 on the fifth test). **Update 2026-10-01:** now 9 tests (added assignee, board drag, two-user live comments,
    priority, and a "several page loads in a row" guard). **Real bug found by the
    suite and fixed:** on every full page load the app sent two `/auth/refresh`
    requests with the same cookie (React StrictMode runs the mount effect twice in
    development); in 24 recorded reloads about 40% returned `[401, 200]` because the
    server treats the second use of a spent token as theft and revokes the whole
    session family, so the NEXT load landed on the login page (this was the earlier
    unexplained manual 401, and made the board test fail 3 of 15 runs). Fix in
    `AuthContext.tsx`: one shared in-flight refresh request. Measured: the guard
    test failed 7 of 10 runs without the fix and passed 10 of 10 with it; the board
    test went from 12 of 15 to 15 of 15. Production has no StrictMode double run, but
    two tabs loading at once could have hit the same race. **Still to do:**
    pre-push wiring, CI, and the web component tests (Vitest + Testing Library).
  - Decided with the owner, 2026-09-30: **tests are code in the repo**
    (`pnpm test:e2e`), not checks driven through the MCP; the MCP stays for
    exploring new features. Playwright, not Cypress, mainly because realtime
    features need two logged-in users in one test (two browser contexts) and the
    tool matches the owner's day job (my comparison is from general knowledge, not
    checked against current docs).
  - First flows: login; create and comment on an issue; board drag; two users
    seeing each other's comment live.
  - Setup work (most of the first slice): run against `flowdesk_test`, never dev
    data; a seed step for a known user and org; a reset between tests like the API
    tests' `resetDatabase`.
  - Plus Vitest + Testing Library component tests for small logic (the palette's
    keyboard handling, `formatRelativeTime`); the web app has no test runner yet
    (`vitest.config.ts` at the root lists only `apps/api`).
  - Owner wants e2e in the Husky pre-push hook too. Named cost: it will make every
    push slower (needs browsers, a database and both servers running). Decide then
    whether to run all flows or only a small smoke set on push and the full set in
    GitHub Actions.
  - Option raised: pull the e2e setup earlier, before Phase 8.5's assignee and
    priority slice, so new features ship with tests. Not decided.
- [ ] Error monitoring
- [ ] **Seeded demo org + "Log in as demo"** — required, not optional
- [ ] OpenAPI generated from contracts, served at `/docs`
- [ ] README: architecture diagram, screenshots, decisions, setup
- [ ] Deploy

---

## MCP server for AI clients (proposed 2026-10-13, ADR 0070)

Design in `docs/adr/0070-mcp-server-and-access-tokens.md`: a local stdio package `apps/mcp` that calls the existing REST API with a personal access token, published to npm from GitHub Actions later.

- [x] **Slice 1: personal access tokens (API only) - DONE 2026-10-13.** Table `api_tokens` (migration 0033), `POST/GET/DELETE /users/me/api-tokens` (session only, refused in a demo, 20 active at most, 30/90/365 days), `GET /users/me/context`, `requireAuth` accepts `fd_pat_...` bearers, and one default-deny list of the GET addresses a token may call (`middleware/token-access.ts`). Read-only: only the `read` scope can be created, every write answers 403 `token_not_allowed`. Per-token rate limit (120/min). **Verified:** 14 HTTP tests + 5 allowlist/limiter tests + a log-redaction test; four mutation checks each failed a test (no expiry check, no revoked check, any method allowed, raw token stored). **Not verified:** the per-token limiter against real traffic (skipped under test; only its keying was tested in an isolated app); behind Render's proxy.
- [x] **Slice 2: "Access tokens" on the Account page - DONE 2026-10-13.** `entities/api-token` + `features/manage-api-tokens`, one new section after Devices: name, expiry (30 days / 90 days / 1 year), the secret shown once with a Copy button, a list with state (Active / Revoked / Expired), last used, and an inline "Revoke" that asks first; a demo copy sees a note instead of the form. The secret lives only in the create mutation's result, never in the list cache. **Verified:** 5 e2e tests (shown once and gone after Done and reload; the secret works for a read and cannot make another token; revoke asks, cancel changes nothing, confirm gives 401; empty name; demo note) plus the 9 existing account tests; two mutation checks failed a test (Done not clearing the secret; no list refresh after revoke); screenshots read in light, dark and phone width. The owner checked the Copy button by hand in a real browser (copy, paste, secret gone after Done); the e2e tests read the field, not the clipboard.
- [ ] Slice 3: `apps/mcp` with the read-only tools, tested against a real client; README with setup for Claude Desktop and Claude Code.
- [ ] Slice 3b: npm publish workflow (tag-triggered, trusted publishing) and a first release.
- [ ] Slice 4: write tools (`create_issue`, `comment_on_issue`, `update_issue`) with a `read_write` scope and "via token" on events.
- [ ] Later, optional: hosted remote server with OAuth.

---

## Honest estimate

3–4 months part-time if the code is actually being read and understood.
Moving faster than that means the learning goal is being skipped.
