# 0068 - The FlowDesc mark, the tab icon, and a frame for every email

Status: **Accepted, built** - 2026-10-13. The owner chose option H of three rounds of logo mockups and asked for the bright teal on dark, the icon in the browser tab, and a logo for emails. Builds on ADR 0066 (the name) and ADR 0067 (the landing page).

## Decisions

1. **The mark is the letters F and D in the page's serif face with a line of flow under them, on a rounded teal tile** (option H). The letters are real outlines cut from the Newsreader font file at the weight and size of the mockup (with `fontTools`), so no icon or email depends on a font loading. The one source of the shapes is `shared/ui/LogoMark.tsx`; the PNG files were drawn from the same paths.
2. **Colors**: a teal tile (`teal-700`, the action color) with a white mark on a light surface, and the bright teal (`teal-300`) tile with a very dark teal mark (`teal-950`) on a dark one. Two token pairs: `--color-logo-tile`/`--color-logo-ink` follow the theme, and `--color-logo-tile-on-dark`/`--color-logo-ink-on-dark` stay bright for the sidebar, which is dark in both themes. The owner asked for the bright teal after first finding it too shiny; if it is too bright in the app, the whole change is four token values.
3. **The tab icon** is `public/favicon.svg`, which switches between the two color pairs with its own `prefers-color-scheme` rule, plus `favicon-32.png` (for browsers that ignore SVG icons) and `apple-touch-icon.png` (180 px, a full square, because iOS rounds it itself).
4. **The mark is shown** beside the name in the sidebar, the phone header, the login and register pages and the landing page's top.
5. **Every email is sent inside one frame** (`withFrame` in `lib/email.ts`, applied in the single `sendEmail`): the mark (`/email-logo.png`, 96 px drawn at 48, served by the app itself), the name, the message, and the copyright line. A PNG, not an SVG, because email programs do not draw SVG. Inline styles and a table, because that is what they support. Templates are unchanged, so none can forget the frame.
6. `public/email-lockup.png` (mark and name, for light backgrounds) is there so a mail signature can link to it by address.

## Limits, named

- **An inbox's sender picture is not ours to set.** Gmail and most programs show an initial in a colored circle for `support@flowdesc.app` unless the sender has a Google account photo or the domain uses a sender-logo standard (BIMI), which was not looked into. A Gravatar may be shown by some programs; not checked which.
- Email images are fetched from `APP_URL`; on a local server they point at localhost, so they do not show in a real inbox from development.
- The email frame was checked rendered in a browser, not in real mail programs (Outlook in particular is known to differ). Dark-mode mail programs may recolor it.
- The favicon was checked to be served and linked; how a given browser tab draws it was not checked in every browser.
- The logo was not checked against existing logos or trademarks.
