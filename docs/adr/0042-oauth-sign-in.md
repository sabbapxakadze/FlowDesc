# 0042 - Sign in with Google and GitHub, and accounts without a password

Status: Accepted - 2026-10-06. Builds on ADR 0041 (which left the buttons out) and ADR 0003 (sessions).

## Context

The owner asked for OAuth on the login and register pages. Four choices were made with the owner: **Google and GitHub**; accounts made through a provider **have no password** (until they add one); a provider sign-in is **linked to an existing account only when the provider says the email is verified**; and the account page gets a **Sign-in methods** section (connect, disconnect, add a password).

## Decision

**The flow** is the OAuth "authorization code" flow with PKCE, done on the server:

1. The web calls `POST /api/v1/auth/oauth/:provider/start {intent: "signin" | "link"}` and gets back the provider's sign-in URL, then navigates to it. It is a `fetch`, not a link, so that "connect" can carry the access token (kept in memory; a navigation cannot send it).
2. The server keeps what must survive the trip (a random `state`, the PKCE verifier, the intent, and for "connect" the user id) in a **signed, httpOnly, 10-minute cookie** (`flowdesk_oauth_state`, path `/api/v1/auth`, SameSite=lax so it comes back on the provider's redirect). No table. It is signed with a key derived from `JWT_SECRET`, has `typ: "oauth_state"` and no `sub`, and a test proves it cannot be used as an access token.
3. The provider redirects the browser to `GET {APP_URL}/api/v1/auth/oauth/:provider/callback?code&state`. The server compares `state` with the cookie (constant time), exchanges the code server to server with the verifier, reads the profile, acts, and **redirects into the web app**: `/` with the refresh cookie set (the app signs itself in by refreshing, like on any page load), `/account?connected=<provider>` after connecting, or `?oauth_error=<code>` on `/login` or `/account`. No token or profile data is ever in a URL. The callback clears the state cookie, so a replayed callback has nothing to match.
   `APP_URL` is the web origin; the Vite proxy (and a production reverse proxy) forwards `/api`, so the cookies stay same-origin and the owner registers `{APP_URL}/api/v1/auth/oauth/<provider>/callback` in each console.

**Who the person is** (the decision table, in `oauth.service.ts`):

1. This provider account is already connected -> that user signs in (the provider's own id is the identity, never the email).
2. The provider did not verify the email -> refused (`oauth_email_unverified`). An unconfirmed address proves nothing.
3. A FlowDesk account has that email -> the provider is connected to it and the person signs in. **If that account's own email was never verified** (someone could have registered a victim's address with their own password, "pre-hijacking"), its password is removed and all its sessions ended first, so only the person who proved the address through the provider keeps access.
4. Otherwise a new account: no password, email verified, its own organization "`<Name>'s workspace`", the person as owner (the same rows registration makes, in one transaction).
5. Someone with no organization gets the same "no organization" refusal as the password login.

**Schema.** `users.password_hash` is nullable; new table `oauth_identities` (user, provider, the provider's user id, the provider's email at connect time), unique on (provider, provider user id) and on (user, provider). Migration `0028`.

**Accounts without a password.** Login answers them exactly like a wrong password (no hint that the account exists). Change password and change email say "add a password first" instead of crashing on the null. `POST /auth/set-password` adds the first password (no "current password" exists; being signed in is the proof; other devices are signed out like after any password change). Password reset by email also works and doubles as "add a password".

**The last way in.** `DELETE /users/me/oauth/:provider` refuses (`last_sign_in_method`) when it would leave no password and no other provider. The check runs in a transaction that locks the user row (`FOR UPDATE`), so two disconnects at the same moment cannot each see "another method is left".

**Providers are optional.** `GOOGLE_CLIENT_ID/SECRET` and `GITHUB_CLIENT_ID/SECRET`: a provider is on only when both of its values are set (one without the other fails at boot). `GET /auth/oauth/providers` lists the enabled ones and the buttons are drawn from it, so there are never dead buttons, and with no credentials the app looks as before.

**The seam.** `lib/oauth/` has one interface (`authorizeUrl`, `exchange`) with `google.ts` (OpenID Connect userinfo: `sub`, `email`, `email_verified`), `github.ts` (`/user` for the id and name, `/user/emails` for the PRIMARY address and whether GitHub verified it) and `fake.ts`. Under `NODE_ENV=test` both names are the fake, whose "provider page" is the callback itself with a `code` that encodes the profile (chosen by a cookie the test sets); it exists in no other environment. API and e2e tests therefore run the real state, cookie, linking, session and UI code with no network.

**Trying it without credentials (development only).** `OAUTH_FAKE=true` in `apps/api/.env` turns on the same fake in development, so both buttons appear and the whole flow can be clicked through, signing in as "Fake Person" (`fake.person@example.com`). It replaces the real providers while on, and the API refuses to boot with it when `NODE_ENV=production`. Making the real providers work is a Phase 9 item with its steps listed in the roadmap.

**Web.** `entities/oauth` (providers query, start call, brand icons, error messages), `features/oauth-sign-in` (the buttons and the "or" line above the email form on Login and Create account; nothing at all when no provider is enabled), `features/connected-accounts` (the Sign-in methods section, with an in-place confirmation before disconnecting and the reason instead of the button for the last method), `SetPasswordForm` in `features/change-password`. A failed attempt shows its message on the login page through `?oauth_error=` (unknown codes get the general message; the text never comes from the URL).

## What was verified, and what was not

Verified by tests: every row of the decision table, the state checks (missing cookie, wrong state, replay, cookie made for another provider, cancelled), connect/disconnect and the last-method guard, passwordless accounts, the two real adapters' parsing against canned provider answers, and the whole browser flow with the fake. Mutation checks: skipping the state comparison, skipping the unverified-account takeover, skipping the last-method guard, forcing the "only method" notice off and echoing a raw error code were each caught.

**Real round trip (added 2026-10-09, Phase 9 slice 9.7).** Both providers are now configured on the live site (https://flowdesk-yotg.onrender.com): the server lists `google` and `github`, and the owner tried the sign-ins there and reported them working as expected. Not itemised: which cases were run (new account, second sign-in, connect and disconnect, cancel). Google runs in Testing mode, so only named test users can sign in until the app is verified by Google (not researched). GitHub's new OAuth App form has a list of redirect URIs (the exact callback is registered, wildcard matching off) and "Expire user access tokens" left on; our server uses the access token once and discards it. Both apps' redirect URLs must be updated if the address changes.

**Still not verified:** whether GitHub enforces the PKCE parameters we send (the `state` check is the CSRF guard either way).

## Trade-offs, named

- Linking by verified email trusts Google's and GitHub's `email_verified` claims. That is the standard rule, and it is exactly why an unverified FlowDesk account is reset on linking.
- A provider-created account is named "`<Name>'s workspace`"; there is no step to choose the organization name (renaming an organization is not built).
- Not in this slice: sign-in through an **invitation** (invited people still set a password), "remember me", more providers, a "which provider did I use?" hint on the login page.
- The refresh response is the one thing a navigation can cut short after the server rotated the token (the app refreshes on the page it lands on); this is the existing behaviour of ADR 0003/0038 for any page load, and the e2e tests wait for the page to be signed in before navigating on.
- The OAuth rate limit (40 per 15 minutes per address) is looser than the password limit because nothing here can be guessed; it is skipped under `NODE_ENV=test` like the others.

## Alternatives rejected

- A random stored password for provider accounts: hides the real state, makes reset the only way in without the provider.
- Never auto-link: safest but forces a login-then-connect detour for everyone who registered first.
- Starting the flow with a plain link (`GET .../start`): cannot carry the access token for "connect".
- A table for pending attempts: the signed cookie needs no cleanup and no storage.
- A library such as Passport: the flow is small, and each provider call is explicit and testable here.

## Amended 2026-10-19: Testing mode does not limit sign-in here

The note above ("Google runs in Testing mode, so only named test users can sign in") was written before the rule was researched, and it is wrong for this app. Google's page on the app audience (https://support.google.com/cloud/answer/15549945) says that basic sign-in scopes (name, email, profile, OpenID Connect) need no test-user listing, show no warning and do not expire; the test-user list, the cap of 100 and the 7-day expiry apply to other scopes. FlowDesc asks only for `openid email profile` (`apps/api/src/lib/oauth/google.ts`), and the owner reports that Google and GitHub sign-in both work for other people while the consent screen is still marked Testing. **Not verified by me:** that behaviour (I did not sign in as another person), and what Google's page leaves unsaid about the exact error a non-listed user would get for other scopes. If a broader scope is ever requested, publish the consent screen first.
