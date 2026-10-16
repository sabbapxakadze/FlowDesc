# 0076 - Counting how many demos were started, and a "get in touch" link in the demo bar

Status: **Accepted** - 2026-10-16. Builds on ADR 0044 ("Try the demo": a private, self-deleting copy per click).

## Context

The owner wanted to know how many demos were started. Nothing could answer it: each copy is deleted after `DEMO_TTL_MINUTES`, the clean-up runs when the next person starts one, and no counter existed, so the database only knows copies that are still alive or not yet cleaned up. Render's logs do show each `POST /demo/start`, but how long they are kept on the free plan was not checked.

The owner first thought of **asking for an email before the demo** and logging it. Considered and rejected for now: the people the demo is for (recruiters and hiring managers looking at a portfolio) are the least likely to give an email, so a gate would turn them away; a typed email is easy to fake, and verifying it would mean sending email to an address a stranger typed, which ADR 0044 keeps away from the demo on purpose; and stored emails are personal data that would need a notice and a retention rule. The owner's goal is a portfolio and job search, not collecting leads, so the demo stays one click.

## Decisions

1. **One row per demo start, nothing personal.** A new table `demo_starts` (`id`, `outcome`, `created_at`). `outcome` is `started` (a copy was made) or `busy` (refused because `DEMO_MAX_ACTIVE` copies were alive). No email, no IP address, no user id, no organization id: a copy is deleted, and the row must stay meaningful after that. The rows are never deleted by the clean-up and never read by the app.
2. **Written by the server, in the demo service**, after the copy is made (`started`) or at the point of refusal (`busy`). Not recorded: the demo being switched off (nobody tried one), and a request refused by the rate limit (it is stopped before the demo code runs, and stays in the logs).
3. **Counting can never stop a demo.** If writing the row fails, the failure is logged and the visitor still gets their demo. A statistic is not worth a broken front door.
4. **Read in the database,** in the Neon SQL Editor, for example:
   ```sql
   select date_trunc('day', created_at) as day,
          count(*) filter (where outcome = 'started') as started,
          count(*) filter (where outcome = 'busy') as refused_busy
   from demo_starts group by 1 order by 1 desc;
   ```
   No page in the app (a page for one reader is more than this needs).
5. **A "get in touch" link in the demo bar.** The bar already says the data is sample data and when it is deleted; it now also carries a quiet `mailto:` link, "Built by Saba. Get in touch", to the same email address the landing page's "Built by" section shows. People inside the demo are the people the owner wants to hear from. The address moves from `BuiltBy.tsx` to `shared/lib/contact.ts`, so the landing page and the bar read one constant (a widget may not import from a page). No new screen and no new animation: the link sits in the bar's existing line and wraps under the text on a phone.

## Limits, named

- **The count says starts, not people.** One person starting three demos is three. Refreshing the page does not start another (the copy lasts), but logging out and clicking again does.
- **Bots count too.** The rate limit (a few an hour per address) keeps one source from inflating it, but nothing separates a crawler that clicks the button from a person.
- **It starts counting now.** Demos started before this change are not in the table; the only trace of them is in Render's logs, if they are still kept.
- **The `mailto:` link depends on the visitor having a mail program set up.** On a computer without one, clicking does nothing useful. The address is also shown as text next to the link's label on the landing page, which is not the case in the bar; that is accepted for a quiet link.
- The email address is in the page source of the landing page and now in the app's bundle: it was already public on the landing page, so nothing new is exposed, but it can be harvested by scrapers.
