# 0070 - An MCP server and personal access tokens

Status: **Accepted. Slices 1 to 3b built** (2026-10-13); the write tools (slice 4) are decided and built in ADR 0074 (2026-10-14). Builds on ADR 0050 (logs never carry credentials), ADR 0044 (demo guard) and ADR 0027 (audit log).

## Context

The owner wants an AI client (Claude Desktop, Claude Code, Cursor and similar) to work with a person's FlowDesc data. MCP (Model Context Protocol) is the open protocol for that: a server exposes "tools", and the client's AI calls them. The spec defines two standard transports, stdio and Streamable HTTP; for stdio the spec says credentials come from the environment, and the HTTP authorization framework applies only to HTTP transports (modelcontextprotocol.io, spec 2025-11-25, "Transports"). Not yet read in full: the remote authorization (OAuth) section and the exact API of the TypeScript SDK (a v2 beta with split packages exists; the installed major version must be checked before any code is written).

Today the API accepts only a short-lived JWT access token (`requireAuth` sets `req.auth.userId`); `requireOrgMembership` then builds `req.ctx` from a real membership row. There is no credential an automated client could hold safely.

## Decisions

1. **Run it locally (stdio), as a new package `apps/mcp`.** The person starts it from their AI client's config with a token in an environment variable. No hosting, no extra cost, no extra load on Render. A hosted remote server (Streamable HTTP with OAuth) is deliberately left for later; the tools are the same, only transport and sign-in differ.
2. **The MCP package talks to the existing REST API over HTTPS and never touches the database.** The API stays the only door, so tenant scoping and role checks live in one place and cannot be bypassed. Tool inputs reuse the Zod schemas in `packages/contracts`.
3. **Personal access tokens (PATs)** are the credential. A new `api_tokens` table: `id`, `user_id`, `name`, `token_hash`, `scope` (`read` or `read_write`), `last_used_at`, `expires_at`, `revoked_at`, `created_at`. The token is a long random value with a recognisable prefix (`fd_pat_`), shown **once** at creation; only a SHA-256 hash is stored (fine for a high-entropy random token, unlike a password). Tokens expire (default 90 days, chosen at creation) and can be revoked; revocation takes effect on the next request.
4. **`requireAuth` gets a second path**: a `fd_pat_` bearer token is looked up by hash and sets `req.auth.userId` plus `viaToken` and its scope. Everything after it (membership, role checks) is unchanged, so a token never holds more rights than its owner. A write with a `read` token answers 403.
5. **Tools, first release is read-only**: `list_projects`, `list_issues` (status, priority, label, assignee, overdue), `get_issue` (with comments and activity), `search_issues`, `get_sprints`, `get_backlog`, `get_analytics`, `get_my_work`. **Writes come in a later slice and only with a `read_write` token**: `create_issue`, `comment_on_issue`, `update_issue` (status, priority, assignee, due date; version-checked like the app).
6. **Left out on purpose, for good:** every delete, member and role changes, invitations, password and account changes, token management itself.
7. **Safeguards**: a per-token rate limit (a new limiter like the existing ones); demo organizations cannot create tokens (`assertNotDemo`, ADR 0044); audit and event rows made through a token say so, so "who did this" stays honest; a test proves the token never appears in logs (ADR 0050).
8. **Accounts page** gets an "Access tokens" section: create (name, access level, expiry), list with last used, revoke.

9. **The package is published to npm from GitHub Actions** (the owner has an npm account), so a person can run it with `npx`. Publishing uses npm trusted publishing (the workflow proves its identity to npm; no long-lived token is stored as a secret): the job needs `id-token: write` and npm 11.5.1 or later, and the repository and workflow file name are registered on the package's settings page (npm docs, "trusted publishers"). It runs only when a version tag such as `mcp-v0.1.0` is pushed, never on every push, and only after slice 3 has been run against a real client, because a published version number cannot be reused.

## What slice 1 did (2026-10-13)

- `api_tokens` table (migration 0033); `POST/GET /users/me/api-tokens` and `DELETE /users/me/api-tokens/:tokenId`, which need a real session (a token cannot manage tokens), are refused in a demo, and stop at 20 active tokens. Lifetimes 30, 90 or 365 days. The contract accepts only `scope: "read"` for now.
- `requireAuth` takes a second kind of bearer, `fd_pat_...`: found by hash, not revoked, not expired, then checked against **one default-deny list of GET addresses** in `middleware/token-access.ts`. Anything else (every write, `/auth`, account, token management, uploads, invitations, audit log, notifications) answers 403 `token_not_allowed`. Membership and role checks run after it as for any person.
- Added beyond the first sketch: `GET /users/me/context` (who the token is and which organization), because every address contains the organization id and a client holding only a token had no way to learn it.
- `last_used_at` is written at most once a minute per token; a per-token rate limit of 120 a minute keyed by a hash of the token (skipped under test, as the other limiters are).
- Revoking is immediate: the lookup excludes revoked and expired tokens on every request.
- `/auth/logout-all` runs on the refresh cookie and never reads a Bearer header, so a token gets 401 there, not 403; either way it cannot sign devices out.
- Tests: `api-tokens.http.test.ts`, `token-access.test.ts` and a log case in `request-logger.test.ts`. Four mutation checks (no expiry check, no revoked check, any HTTP method allowed, raw token stored) each failed a test.
- Not audited: token creation and revocation are logged but write no `audit_events` row (that table needs an organization; tokens belong to a person).

## What slice 2 did (2026-10-13)

- An "Access tokens" section on `/account` (after Devices): create (name, 30 days / 90 days / 1 year, read-only), the secret shown once with a Copy button, the list with Active / Revoked / Expired, last used and an inline Revoke that asks first. A demo copy sees "not available" instead of the form, so a visitor never meets a form the server would refuse.
- The secret is held only in the create mutation's result, never in the list's cache, so it is gone after Done or a reload. Web only: no API change.
- The owner checked the Copy button against the real clipboard by hand (2026-10-13).

## What slice 3 did (2026-10-13)

- New workspace package `apps/mcp` (name `flowdesc-mcp`, still `private`): a local stdio MCP server built on `@modelcontextprotocol/sdk` 1.32.1 (the stable line; the v2 split-package line is a beta and was not chosen). Credentials come from the environment: `FLOWDESC_TOKEN` (must start `fd_pat_`) and `FLOWDESC_URL` (default `https://flowdesc.app`; plain `http` only for localhost, so a token is never sent unencrypted to another machine).
- Nine read-only tools, all marked `readOnlyHint` and all saying that issue text is data, not instructions: `whoami`, `list_projects`, `list_issues`, `get_issue`, `search_issues`, `get_sprints`, `get_backlog`, `get_analytics`, `get_my_work`. They take project keys and label names (the model's vocabulary) and resolve them to ids. Answers are JSON text, cut at 50,000 characters with a note on how to ask for less.
- `src/client.ts` is the only code that touches the network. Errors become plain sentences (revoked or expired token, not allowed, rate limited, unreachable, not JSON) and the token is removed from any text that could contain it. The organization id is asked once; projects are cached for a minute.
- Tests: 26 in `apps/mcp` against a pretend FlowDesc (in memory and as a real child process over stdio), plus `apps/api/.../mcp.http.test.ts`, which drives all tools against the real API and database: real data comes back, another organization's project and search hits are invisible, a revoked token stops every tool, and no row in any data table changes. Eight mutation checks (four on the API side in slice 1, four here: no Authorization header, token not redacted, any http host accepted, the project argument ignored) each failed a test.
- Real run: the built `dist/index.js` was driven over stdio by the SDK's own client against the local API and the demo organization (76 issues): all nine tools returned real data and a wrong project name returned the list of real keys. The biggest answer (the backlog) was about 26,000 characters.
- The MCP SDK could not be added to `apps/api` (pnpm linked it to a folder that does not exist, even after `--force`), so `flowdesc-mcp/testing` exports a small in-memory client helper and the API test uses that.
- CI: the API test job now builds `flowdesc-mcp` (and with it the contracts) before the tests, because the API test imports the built package.
- **Real AI client: done by the owner** (2026-10-13): the owner ran the built server in a real AI client and confirmed it works. **Not verified:** repeating `--env` in `claude mcp add`; the prompt-injection risk is reduced, not removed.

## What slice 3b did (2026-10-13)

- **Licence: MIT for this package only** (the owner's choice; `apps/mcp/LICENSE`). The repository's own LICENSE ("All rights reserved") is untouched.
- **Bundling.** `@flowdesc/contracts` is private and not on npm, so `pnpm --filter flowdesc-mcp bundle` (tsc, then esbuild) writes one file, `apps/mcp/bundle/index.js` (about 40 KB, shebang kept, contracts inlined, the MCP SDK and zod left as normal dependencies). Contracts moved to `devDependencies`. The tarball holds exactly `bundle/index.js`, `README.md`, `LICENSE` and `package.json` (checked with `npm pack --dry-run`). The `tsc` output in `dist/` stays for tests and for running from source; `flowdesc-mcp/testing` is a workspace-only export and is not in the tarball.
- **Safety before publishing.** `prepack` (`scripts/check-bundle.mjs`) refuses to pack when `bundle/index.js` is missing or still imports the private contracts (both tried and refused). The real tarball was installed with npm into an empty folder: only the SDK and zod came with it, the installed program listed nine tools and answered `whoami` over real stdio, and both the npm shim and `npx --no-install` started it (and exited 1 with the message when the token was missing).
- **Workflow `.github/workflows/publish-mcp.yml`**: runs only on a pushed tag `mcp-v*`; refuses a tag that does not equal the version in `apps/mcp/package.json` (tried: matching passes, `0.1.1`, `0.1.0-x` and an empty number are refused); builds, runs the package tests, makes sure npm is 11 or newer, then `npm publish --access public` with `id-token: write` and **no stored token** (npm trusted publishing; provenance is added automatically because the repository and package are public).
- **First release by hand, then trusted publishing.** I could not confirm from npm's docs whether a trusted publisher can be set up before a package exists, so the plan is: the owner publishes `0.1.0` once from their own terminal (`pnpm --filter flowdesc-mcp bundle`, then `npm publish --access public` in `apps/mcp`, with their 2FA code), then adds the trusted publisher on npmjs.com (user `sabbapxakadze`, repository `FlowDesc`, workflow file `publish-mcp.yml`), then proves it by releasing `0.1.1` through a tag within 2 days (npm expires a configuration that has not completed a first publish by then). Afterwards the owner can switch on "require two-factor authentication and disallow tokens" for the package.
- **Done on 2026-10-13 (verified in the owner's browser and from the registry, not assumed):**
  - `flowdesc-mcp@0.1.0` was published by hand by the owner (2FA on, `npm publish --access public`). npm showed an extra `0.0.0-stage` version published a minute earlier that nobody here created (cause unknown; probably a placeholder from npm's staged-publishing feature).
  - The trusted publisher was added on the package's Settings page: user `sabbapxakadze`, repository `FlowDesc`, workflow `publish-mcp.yml`, no environment, **Allow `npm publish` ticked** (the owner chose direct publishing; npm marks it "not recommended" and offers staged publishing instead, where each version is approved with 2FA). Status went from "Pending validation" to **Valid** after the first tag release.
  - Tag `mcp-v0.1.1` (commit `3668e27`) ran the workflow in 37 seconds and published `0.1.1` as `latest`. npm's registry returns a publish attestation and an SLSA provenance record for `0.1.1` naming the repository, `.github/workflows/publish-mcp.yml`, `refs/tags/mcp-v0.1.1` and that commit. `0.1.0`, published by hand, has none (404), as expected.
  - Publishing access was switched to "Require two-factor authentication and disallow bypass 2fa tokens" (read back after a reload). npm's own page says trusted publishers keep working under either option.
  - What I could not confirm from npm's docs, now answered by doing it: a trusted publisher **can** be added after the first manual publish (the Settings page has the section as soon as the package exists).
- **Still not verified:** `engines.node >= 22` (tested on Node 24 only); `npx -y flowdesc-mcp` on a clean machine (the tarball was installed with npm into an empty folder before publishing, and the owner's real-client run used the local build); how npm's staged publishing would behave if the owner later switches the workflow to it.

## Slices

1. Tokens: schema + migration, create/list/revoke API, the `requireAuth` second path, tests (revoked, expired, read-only on a write, wrong organization, a token for user A never sees user B's data).
2. Account UI for tokens.
3. `apps/mcp` with the read-only tools, tests against a real API, README with a setup snippet for Claude Desktop and Claude Code (how to get a token, where to paste it).
3b. The npm publish workflow (tag-triggered, trusted publishing) and a first release, after slice 3 is tested with a real client.
4. Write tools, with the prompt-injection note in the README.
5. Later, optional: hosted server with OAuth.

## Limits, named

- **Prompt injection is reduced, not removed.** Issue titles and comments are written by other people, and an AI reading them can be steered by text in them. The defences are: read-only by default, writes opt-in per token, no destructive tools, tool descriptions that call issue text data. A person who gives a `read_write` token to an AI accepts that the AI may act on text it reads.
- A token is as powerful as its owner within its scope: it reaches every organization the person belongs to. Per-organization tokens are not planned.
- The local server means each person installs and configures it themselves; there is no one-click connection.
- A rate limit in memory resets on restart and is not shared across servers (same as the other limiters; the Redis item in Phase 9).
- Not yet checked: that the chosen package name is free on npm, whether a scope (`@name/...`) needs a paid organization, and whether trusted publishing needs one manual first publish before it can be configured.
- Which AI clients work was not checked; only the protocol was read. Each client's config format and pricing are the client's own.
- Not yet verified: the SDK's current API, and that a real client can list and call the tools. Slice 3 must be run against a real client before it is called done.
