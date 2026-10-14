# 0075 - A "Report a bug" button: a short form with screenshots, sent by email to support

Status: **Accepted** - 2026-10-14. Builds on ADR 0066 (the domain's email), ADR 0044 (what a demo copy may not do) and ADR 0053 (files).

## Context

People using FlowDesc have no way to tell the owner something is broken except by finding an email address. The owner asked for a small bug icon in the app that opens a form with a description and screenshots and sends it somewhere, for logged-in people only, and chose **email** as the destination (support@flowdesc.app already forwards to the owner's inbox, ADR 0066).

## Decisions

1. **A button in the app, a dialog with a form.** A small bug icon button (Lucide `Bug`, accessible name and tooltip "Report a bug") opens a dialog: a description (required, up to 5000 characters) and up to 3 screenshots, picked from disk or pasted. Placement is the sidebar's bottom row beside the theme switch and the MCP pill if it fits at every width we support; if it does not, a floating button at the bottom right (see "Placement" below). Hidden in a demo copy.
2. **Sent by email, not stored.** `POST /api/v1/bug-reports` (multipart) sends one email to `BUG_REPORT_TO` (a new optional setting; it defaults to `EMAIL_FROM`, which is support@flowdesc.app on the live site) and nothing is written to the database. The screenshots are attached to the email, not saved in our storage. The email's `Reply-To` is the reporter's address, so answering is just replying. Rejected: saving reports in a table (nothing reads them yet; a later slice can add it), creating a GitHub or FlowDesc issue (needs a credential or a cross-organization write).
3. **Who may send.** A signed-in session only. Access tokens are refused (the address is not on the token list, ADR 0070). A demo copy is refused with the same `denyInDemo` guard as uploads and invitations (ADR 0044), because this sends email to an address the visitor did not choose and carries uploads. At most **5 reports an hour per person** (a limiter keyed by user, skipped under test like the others).
4. **What the email says, and who says it.** Who the reporter is comes from the server (their name, email and organization, read from the database), never from the form. The browser adds only what it alone knows: the page the person was on (path and query, never the address fragment), the window size, and their text. The server adds the browser's `User-Agent` header and the time. The form tells the person this will be sent, and warns that screenshots may show private data. Every value is escaped before it goes into the email's HTML.
5. **Screenshots are checked on the server.** At most 3 files, 5 MB each, and only PNG, JPEG or WebP, decided by the file's first bytes, not by the name or the type the browser claims (the same weakness ADR 0053 names for attachments, avoided here because the file is going into someone's inbox). Anything else is a 400 and nothing is sent.
6. **A failed send is an error the person sees.** The email helper used to log a failed send and carry on (right for a verification email, where the person can ask again). A bug report that silently vanished would be worse than none, so `sendEmail` now says whether it worked, and this route answers 502 "We could not send your report. Please try again, or write to support@flowdesc.app." when it did not. The other callers are unchanged.
7. **How it is tested.** The API tests replace the mail provider's client (as `lib/email.test.ts` does) and read the message that would be sent: recipient, Reply-To, subject, escaped text, attachments. The browser tests run the API with a new setting, `EMAIL_DRIVER=log`, under which a message is only logged and counts as sent (the default, `resend`, is what runs in production), so the form can be used end to end. **Nothing in the test suite proves a real email is delivered**; that is checked by hand once, on the live site.

## Placement

The sidebar's bottom block has one row with the theme switch on the left and the MCP pill on the right. A third small button fits only if the row has room at the desktop width and in the phone drawer (16rem, at most 85% of the screen), in light and dark. It is measured in the browser, not assumed. If it does not fit, the button is a fixed round icon button at the bottom right of the window, above the page (where the dev-only query tool also sits, so in development it is moved up to stay clear of it). A floating button can cover page content and sits where the issue side panel opens, so it is the second choice.

## Limits, named

- No history: a report exists only in the owner's inbox.
- The person gets no copy of what they sent and no ticket number.
- Screenshots are only what the person attaches; the app does not capture the screen itself.
- Email size: three 5 MB pictures are 15 MB before email encoding; the provider's own limit (not tested here) could refuse a large report, in which case the person sees the error above.
- A person could send 5 reports an hour; there is no deeper abuse protection (they are signed in and named in the email).
