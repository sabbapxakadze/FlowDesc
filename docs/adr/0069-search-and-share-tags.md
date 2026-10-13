# 0069 - What search engines and shared links see

Status: **Accepted, built** - 2026-10-13. Builds on ADR 0043 (the landing page), ADR 0066 and ADR 0068.

## Decisions

1. **The page title is "FlowDesc: plan the work, follow it through"** (it was the bare name), and the description stays one sentence. The live smoke check (ADR 0055) only needs "FlowDesc" in the page, so it is unaffected.
2. **Share tags**: Open Graph (`og:`) and a Twitter card of the large-image kind, with a 1200x630 picture (`public/og-image.png`: the mark, the name and the headline on the landing page's colors, drawn from the same fonts). Addresses in the tags are written in full (`https://flowdesc.app/...`), because chat apps and crawlers need absolute ones.
3. **`public/robots.txt`** allows the site, keeps crawlers out of `/api/` and of the pages reached by an emailed single-use link (`/invite`, `/reset-password`, `/verify-email`, `/confirm-email-change`), and names the sitemap. **`public/sitemap.xml`** lists the one public page (the landing page at `/`); everything else is behind a login.
4. **One canonical address, `https://flowdesc.app/`**, and a `theme-color` (the teal) for browser chrome on phones.

## Limits, named

- The canonical tag is in the one HTML file every route is served from, so every page claims `/` as its canonical address. That is harmless for pages behind a login (nothing to index), and not right for a page that later becomes public in its own right: that page would need its own tag, which a single-page app can only do by setting it from script (crawlers that do not run script would not see it).
- The `robots.txt` list keeps polite crawlers away; it does not stop a link to a private page from being listed, and it is not a security measure (the pages are protected by the login and by single-use tokens).
- The tags were checked to be present and the files to be served, not checked in the real previews of chat apps or social networks (they cache pictures and have their own debuggers), and not checked in a search console.
- The sitemap's date is written by hand and is not updated by a build.
- No structured data (schema.org) was added.

## Amended 2026-10-14 (ADR 0073)

The share picture is now `public/og-image-v2.png` (1200x630): the logo and headline on the brand gradient, and the board, issue list and analytics screenshots (light theme) stacked beside them, with an "MCP server for AI assistants" badge, so a shared link shows the product itself. It is a new file name on purpose: chat apps and LinkedIn cache a picture by its address, so a changed file under the old name would keep showing the old one. The old `og-image.png` is kept so links shared before still have a picture. The picture is drawn by a script outside the repository from the screenshots in `public/landing/`, so it is out of date whenever those are (retake both). LinkedIn also caches the page's tags: after a deploy, its Post Inspector page re-reads them (not opened or verified here).

