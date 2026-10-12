# 0066 - The product is renamed from FlowDesk to FlowDesc

Status: **Accepted, built** - 2026-10-12. The owner could not register any flowdesk domain; `flowdesc.app` was available.

## Context

The name was in the UI, the emails, the docs, the package names (`@flowdesk/*`), cookie and browser-storage keys, the health-check service name, the demo data and the backup file names.

## Decisions

1. **The name shown to people is FlowDesc**, everywhere in the repo's code, tests and current docs (README, CLAUDE.md, security, backups, architecture).
2. **A full rename inside the repo**, not only the visible text: the workspace package scope is now `@flowdesc/*` (lockfile regenerated), the cookies are `flowdesc_refresh_token`, `flowdesc_oauth_state`, `flowdesc_oauth_trip`, the browser-storage keys are `flowdesc-theme` and `flowdesc.lastActivity`, the health check reports `flowdesc-api`, the demo organization slug is `flowdesc-demo` and the demo emails end in `@flowdesc.test` (login: `demo@flowdesc.test`).
3. **Things that live outside the repo keep their names**, because renaming them in the repo would break a running thing: the local databases and role (`flowdesk_dev`, `flowdesk_test`, role `flowdesk`), the Render service and its address (`flowdesk-yotg.onrender.com`, until the domain is connected), the storage bucket `flowdesk-files` and the credential `flowdesk-render`, and the fake URLs and bucket names inside test fixtures.
4. **History is not rewritten**: the ADRs, the roadmap and the learning log keep the old name, because they record what was true when they were written. This ADR is the bridge.

## Consequences (what the owner will notice once)

- Everyone is signed out once (the refresh cookie has a new name) and the saved light/dark choice resets (new storage key).
- Old demo data in a dev database stays until `pnpm db:seed:demo --reset` is run; the new seed uses the new slug and emails, so the old organization is left behind, not updated.
- The landing page screenshots show the old name until `pnpm landing:shots` is run again.
- Old backup artifacts keep their old file names; new ones are `flowdesc-YYYY-MM-DD.dump.enc`.

## Not done here

- The domain `flowdesc.app` was bought and connected by the owner on 2026-10-12: two CNAME records in Cloudflare (DNS only, grey cloud, so Render can issue its own certificate), `APP_URL=https://flowdesc.app` set in Render (the live security header then lists `wss://flowdesc.app`), and the Google and GitHub callback addresses changed; the owner checked that both sign-ins work. The old `onrender.com` address still answers. Not proxied through Cloudflare: that would add a hop, so `TRUST_PROXY` (ADR 0051) would have to be measured again.
- Email sending stays off until a sender exists on the new domain.
- The GitHub repository and the Render service are not renamed.
