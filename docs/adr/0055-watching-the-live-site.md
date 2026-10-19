# 0055 - Watching the live site: smoke check, uptime, backups, error tracking

Status: Accepted - 2026-10-09. Phase 9 slice 9.9. Builds on ADR 0049 (first deploy, no keep-alive pings), 0050 (secrets out of logs), 0053 (object storage) and 0054 (security pass).

## Context

The site is public and runs on free hosting that sleeps. Nobody would notice it going down, a database mistake could not be undone past Neon's short history window, and an unexpected server error was visible only to someone reading Render's log (the first failed file upload was found that way). The constraints from earlier decisions: no keep-alive pings, no card, no paid service, a public repository.

## Decisions

1. **A read-only smoke tool** (`apps/api/src/tools/smoke-live.ts`, run with `node apps/api/src/tools/smoke-live.ts <address>`). GET requests only: the health check, that the app's page is served, a strict Content-Security-Policy, `nosniff`, no `X-Powered-By`, HSTS, a private endpoint answering 401, an unknown API address answering a JSON 404, `/.env` and `/.git/config` not served as files, the sign-in providers and the demo info answering. It waits for a sleeping server to wake. It is self-contained (only Node's own modules), so Node 24 runs the file directly with no install. It does not touch the database, so a database outage alone is not detected. Tests break one thing at a time against a fake site and require the matching check to go red (a mutation that always passes a check was caught).
2. **A daily uptime check** (`.github/workflows/uptime.yml`): GitHub's own scheduler runs the smoke tool once a day. No third-party monitor, no account, and ONE request a day, so the server is still allowed to sleep (the earlier decision against keep-alive pings stands: a monitor that pings every few minutes would keep the free server running all month and use up its free hours). The cost is that an outage can go unnoticed for up to a day.
3. **A weekly encrypted backup** (`.github/workflows/backup.yml`, `docs/backups.md`): `pg_dump` of the live database, a check that the archive lists the users table, AES-256 encryption with a passphrase kept in a repository secret, kept as a workflow artifact for 90 days. Encrypted because the repository is public and the dump holds emails and password hashes. It covers the database only, not the bucket. Neon's own 6-hour history window is the first layer.
4. **Error tracking with Sentry, server side only, off unless `SENTRY_DSN` is set** (`lib/error-reporting.ts`). Unexpected errors (the generic 500s) and a crash are sent with the error, the request id, the method and the route pattern, and the running commit. Not sent: cookies, headers, bodies, the visitor's address, the signed-in person, breadcrumbs, traces; every automatic collection switch is off by name, and an email address inside an error message is replaced. Expected errors (404, 403, validation, a 503 for disabled uploads) are not reported, to keep the free quota (5,000 a month, as read from a third-party summary) for real bugs. The SDK is loaded only when the DSN is set: loading it measured about 31 MB of memory (53 to 84 MB) and starting it about 2 MB more, on a 512 MB server.

## Not done, and why

- **Error tracking in the browser.** It would need the page's security policy to allow the tracker's address and a build-time setting; the browser errors people hit are not visible yet. A later slice if wanted.
- **Alerting beyond what GitHub and Sentry do by themselves.** Whether GitHub emails the owner when a scheduled run fails was not verified.
- **Backup of the files in the bucket,** and a tested restore into a real database (the local role cannot create one).

## Not verified

A run of either workflow by the SCHEDULE (the owner ran both by hand on 2026-10-09 and reported both green; that proves the steps work on GitHub's machines, not that the timer fires); a restore into a real database; Sentry receiving a real event (the tests use a fake transport, so nothing was sent to Sentry); GitHub disabling scheduled workflows after a long quiet period in a public repository (I believe it does after 60 days without repository activity; not verified); Sentry's free-plan limits (from third-party summaries).

## What needs the owner

`DATABASE_URL` and `BACKUP_PASSPHRASE` as repository secrets and one manual run of the backup; a Sentry account (free) and its DSN as `SENTRY_DSN` in Render, if error tracking is wanted; passphrase kept in a password manager.

## Amended 2026-10-19: a keep-alive Worker was added

The decision against keep-alive pings (decision 2 above, and ADR 0049) no longer holds. The owner added a **Cloudflare Worker** (in the Cloudflare dashboard, not in this repository) that sends a request to the site **every 10 minutes**, so the free Render server stays awake and a visitor does not wait for it to start. The owner reports that the site is always up and that people no longer wait for a cold start.

What this changes and what it does not:

- **The daily GitHub check stays.** It is the read-only smoke check (headers, private endpoints, no leaked files); the Worker only keeps the server awake and says nothing about whether the site is correct.
- **The cost the old decision named is real:** a server awake all month uses Render's free instance hours. About 744 hours is one server for 31 days; whether that fits the free allowance, and whether anything else in the workspace uses hours, was **not checked** (the owner should read Render's usage page). If the hours run out, Render suspends the service until the month resets.
- **The database is not kept awake.** The health check deliberately does not touch Neon (render.yaml), so Neon's free database can still go to sleep; the owner reports it wakes fast enough that nobody notices. That is an observation, not a measurement.
- **Not checked from this repository:** which address the Worker requests, its Cloudflare setup, and that it really runs every 10 minutes. This section records the owner's description. The one live request made while writing it (a health check answered 200 in about 0.4 s, the home page in 0.13 s) fits an awake server and proves nothing about "always".
- Render's own limit for an idle free service is, from memory, 15 minutes, so a request every 10 minutes is inside it. Not verified.
