# 0063 - Rich issue descriptions: formatting, pictures and mentions

Status: **Accepted, built** - 2026-10-11 (steps 1 to 3). Agreed with the owner in conversation. Builds on ADR 0056 (formatted comments), 0062 (pictures in comments) and 0033 (mentions). This is slice 3 of ADR 0062.

## Context

An issue's description is a plain text box. Comments have a rich editor (formatting, @mentions, pasted pictures). The owner wants the description to use the same editor, including pictures pasted into it and in the New issue popup, and wants a person @mentioned in a description to be notified.

## Decisions (agreed)

1. **The same editor.** `RichTextEditor` (shared/ui) is domain-free, so the description reuses it; only a small wrapper for descriptions is new. The stored description is the same Markdown subset the comments use (`parseCommentMarkdown` reads it), in the same `description` column (no new field, max 10,000 characters as now).
2. **Existing plain descriptions** are read as that Markdown. Line breaks are kept, so most look the same; one that happens to contain Markdown-looking characters (`**x**`, a line starting with `- `) now shows formatted. Same trade-off ADR 0056 accepted for comments.
3. **Pictures in a description belong to the issue.** Pasting in the edit popup uses the existing issue draft upload (ADR 0062). Pasting in the **New issue popup** has no issue yet, so a draft may belong to a **project** first: `attachments.project_id` (nullable, cascades with the project), `issue_id` becomes nullable, and a check keeps at least one of the two set. Creating the issue links the drafts to it in the same transaction. A new endpoint `POST .../projects/:projectId/draft-images` takes these uploads (images only, `manage_issue`, refused in a demo like every upload).
4. **Which pictures a description may show** (checked by the server on create and update, like comments): an image file, at most 10; on create, the writer's own draft of this project; on update, the writer's own draft (of this issue or this project) or a file the description ALREADY showed (anyone may keep what is there; nobody may bring in another person's file). A bad reference is a 400 (`invalid_inline_image`, `too_many_inline_images`) and nothing is saved. Linked pictures become ordinary files of the issue, like a comment's. Removing a picture from the text leaves the file attached (named limit, as for comments).
5. **Mentions notify.** Creating an issue tells the members its description mentions; an update that changes the description tells only the people the edit ADDS (as for comment edits). The server checks each is a current member (a made-up or foreign id is dropped). The ids travel in the event payload (`mentions`), and a person mentioned reads "mentioned you in the description".
6. **Search** keeps working on the words: the generated search column strips picture tokens and reduces a mention token to the person's name, so searching "attachment" or an id finds nothing by accident.
7. **Where it shows:** the issue page card and the side panel draw the description with the comment reader (pictures through the existing zoom popup); the edit popup and the New issue popup use the editor.

## Steps (one per session; tests are part of each)

1. **Server:** the migration (nullable `issue_id`, `project_id`, the check, the search expression), the project draft endpoint, linking and checks on create and update, mentions and their notifications, cleanup and project delete covering project drafts, API tests.
2. **Editor:** the description wrapper, the edit popup and the New issue popup, "Uploading picture..." waits, the e2e specs that type into the plain box updated, one browser test with a picture.
3. **Drawing:** the issue page and side panel, the notification wording, the tour or docs if they mention a plain box.

## As built (2026-10-11)

- **Editor:** `MentionEditor` (entities/member) is the shared rich editor with the people behind `@`; the comment box, the edit popup and the New issue popup use it. In both popups the "Description" label is a plain `<span>`, not a `<label>` (a label would wrap the toolbar buttons and a click on the word would press Bold); the editor names itself with `aria-label`. Save / Add issue wait while a picture uploads ("Uploading picture...").
- **Drawing:** the issue page card and the side panel draw the description with `MentionedText` (formatting, mentions as profile links, pictures through `InlineImage` and the zoom popup). The "Show more" fold is unchanged.
- **Wording:** a notification for a description mention reads "mentioned you in the description" (`describeEventFor`).
- **Tests that changed:** the textarea-only "resize" e2e test was removed; the line-break test types with Shift+Enter; the fold test finds the folded box by the button's `aria-controls`.
- **Named limits:** the New issue popup's pictures are project drafts until the issue is created (24 hours at most). A description picture is also listed in the issue's Attachments (like a comment's); deleting that attachment breaks the picture. The search index ignores picture tokens and keeps a mention's name. Safari and phone clipboards are untested. Mentions in descriptions notify only on create and on edits that add them.

## Risks and not yet decided

- A description is edited as a whole with a version check, so two people editing still get the usual conflict answer; a conflict must not lose a pasted picture (it stays a draft for 24 hours).
- The New issue popup abandoned with pasted pictures leaves project drafts; the 24-hour cleanup removes them on the next upload.
- Safari and phone clipboards are untested, as for comments.
