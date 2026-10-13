# Security notes

What was reviewed, what is accepted, what to rotate and when, and what only the owner can check. Written 2026-10-09 with the first security pass (ADR 0054). It records what was seen on that day; it is not a promise about later changes.

## Findings of the first pass

| # | Finding | Seen how | What was done |
|---|---------|----------|---------------|
| 1 | 8 audit findings (3 critical, 3 high, 2 moderate), all in development tools | `pnpm audit`; `pnpm audit --prod` is clean; built bundle searched | 7 pinned to patched versions; `braces` (high) has no patch and is reached only by the lint tooling |
| 2 | A password reset request answered more slowly for a registered address | Read in `auth.service.ts` | The email is no longer awaited; a test fails without the change |
| 3 | Registration says "email already registered" | Read in code | Accepted: the usual trade-off |
| 4 | No rate limit on `/auth/refresh` and the one-time-token confirm endpoints | Read in the route list | Accepted: long random tokens; a refresh limit could sign out people behind one shared address |
| 5 | The Content-Security-Policy allows inline styles | Live headers | Accepted: inline styles from the UI; no inline scripts |
| 6 | The password rule is "8 characters or more" | Read in the contracts | Accepted for now |
| 7 | Old Render log lines from before ADR 0050 may still contain login tokens and cookies | Found in the first deploy | Sign out of all devices (Account page) from the browsers that were used then |

"Seen how" is what was actually done. Not done: a security scanner against the live site, a full secret scanner over the git history, a review of third-party code, a check of TLS on the Neon connection.

## Secrets: where they live, and how to rotate

None is in the repository. All live in Render's Environment page (and the provider's own console). Rotate one when it was shown to someone, pasted somewhere it should not be, or on a schedule you choose. After changing a value in Render, the service redeploys.

| Secret | Where it comes from | To rotate | What changes for people (from reading the code, not tested) |
|--------|--------------------|-----------|------------------------------------------------------------|
| `JWT_SECRET` | Render generated it | Set a new long random value | Signed access tokens and the 10-minute sign-in-with-provider cookie stop working; sessions are renewed from the database-held refresh tokens, so people should not need to log in again |
| `ATTACHMENT_SIGNING_SECRET` | Render generated it | New long random value | Download links already on a page stop working (they last 5 minutes); a reload makes new ones |
| `DATABASE_URL` | Neon (direct connection string) | In Neon reset the role's password, copy the new string | None, after the redeploy |
| `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Neon credential `flowdesk-render` | Create a new credential (`storage:read`, `storage:write`), put it in Render, then delete the old one | None |
| `GOOGLE_CLIENT_SECRET` | Google Cloud, the OAuth client | Add a new secret in the console, update Render, delete the old one | None |
| `GITHUB_CLIENT_SECRET` | The GitHub OAuth App | Generate a new client secret, update Render, delete the old one | None |
| `RESEND_API_KEY` | Resend (a real sending key since 2026-10-12) | New key in Resend | None |

## Things only the owner can check (not visible from here)

- **GitHub, Settings:** the repository is public, so anything ever committed is public. In Settings, Code security, check whether Dependabot alerts, Dependabot security updates and secret scanning are on (I believe they are free for public repositories; not verified), and whether private vulnerability reporting is on. Branch rules and required checks are planned for the very end (ADR 0047).
- **Render:** who has access to the workspace, that pull request previews are off (a preview of someone's pull request would run their code with your environment), and that the service's environment variables are marked secret.
- **Neon:** who has access to the project, and that the connection string in Render is the one for the role you expect.
- **Google Cloud:** the OAuth client's authorized redirect URI is only the production one; the consent screen is in Testing with only the listed test users.
- **Accounts:** two-factor sign-in on GitHub, Render, Neon, Google and Resend, because each one holds a key to the live app.

## Added with ADR 0055 (watching the live site)

- **Secrets in GitHub:** `DATABASE_URL` and `BACKUP_PASSPHRASE` (for the backup workflow) are repository secrets. Anyone who can edit workflows on the default branch could print them, so only the owner should have write access; pull requests from forks do not receive repository secrets. Rotate `BACKUP_PASSPHRASE` by changing the secret (old backups still need the old one: keep it).
- **Error tracking (if switched on):** only the server reports, with the error text, request id, method and route pattern; no cookies, headers, bodies, addresses or people; email addresses inside error text are replaced. A third party (Sentry) then holds those error texts; whether a text can still contain something private (an id, a name) was reduced, not eliminated.
- **The backup is encrypted** because the repository is public; losing the passphrase makes it useless.

## Added with ADR 0070 (personal access tokens)

- **What a token is:** a long random value (`fd_pat_...`) a person creates for an automated client; only its sha256 hash is stored, and the secret is shown once. It acts as its owner and never exceeds their role.
- **What a token can reach:** only the GET addresses in `middleware/token-access.ts`. It is default-deny: a new route is closed to tokens until someone adds it there on purpose. Writes, `/auth`, account, token management, uploads, invitations, audit log and notifications are all closed.
- **Revoking:** the owner revokes a token on the account (Account page, "Access tokens"); it stops working on its next request. Tokens also expire (30, 90 or 365 days).
- **Logs:** the Authorization header is redacted by the logger (ADR 0050), and a test covers a `fd_pat_` value.
- **The MCP server (`apps/mcp`):** reads the token from the environment, never prints it, strips it from error text, refuses a plain `http` address unless it is localhost, has no write tool, and tags every tool as read-only with a note that issue text is data. The README tells people the token is a password.
- **Publishing the MCP package (slice 3b):** `.github/workflows/publish-mcp.yml` publishes to npm with trusted publishing (OIDC): no npm token is stored in GitHub, and npm only accepts the publish from this repository and this workflow file. Anyone who can push a tag `mcp-v*` here can start a release, so only the owner should have write access (the workflow also refuses a tag that does not match the package version and runs the tests first). The owner has switched on "require two-factor authentication and disallow bypass 2fa tokens" on the npm package (2026-10-13), so a stolen token cannot publish; only the owner with 2FA, or this workflow, can. The trusted publisher allows direct `npm publish` (not staged approval), which npm marks "not recommended": a tag pushed by anyone with write access releases at once. A published npm version cannot be reused or fully erased: the tarball holds only the bundle, README, LICENSE and package.json (checked), so no secret can be in it unless it is written into the source.
- **The MCP pill in the sidebar (ADR 0071)** is a cue: green means a token was used in the last 5 minutes, so an unexpected green dot is a reason to open Account and revoke. It shows nothing a token's owner could not already read there. The "?" help only ever shows the placeholder `fd_pat_YOUR_TOKEN`, never a real secret.
- **Not covered:** an AI client that holds a token can be steered by text in issues and comments it reads (prompt injection); the read-only scope limits the harm to reading what its owner can read.

## Known limits, named

- Rate limits are in memory, per instance, and reset on restart (fine for one instance; shared limits come with Redis, 9.8).
- The demo is a public write endpoint (`DEMO_ENABLED=true`): five starts an hour per address, at most 40 live copies, and no invitations, email, password, upload or provider changes inside a demo (ADR 0044). A flood from many addresses can fill the 40 and show "demo is busy" until copies expire; nothing outside the demo is affected.
- The attachment type is client-supplied (not sniffed from the bytes); files are served with their stored type and `nosniff`.
- File bytes pass through the app server (ADR 0053).
