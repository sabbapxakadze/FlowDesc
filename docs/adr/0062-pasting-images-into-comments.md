# 0062 - Pasting images into comments (slice 1 built)

Status: **Accepted, slice 1 built** - 2026-10-11. Agreed with the owner in conversation. Slice 1 (server and format) is built; slices 2 and 3 are not. Builds on ADR 0056 (formatted comments), 0023 (attachment previews) and 0053 (object storage).

## Context

A person can attach files to a comment with "Attach files": the comment is posted first, then each file is uploaded with the comment's id, one at a time, and shows as a thumbnail under the comment. The owner wants pasting an image
(Ctrl+V, or dropping a file) to feel like a chat app: the picture appears at once, inside the text, and posts with the comment. Videos are not part of this; they stay attachments.

## The problem that shapes the design

For an image that sits INSIDE the text, the file must exist before the comment is saved, so the order flips (upload first, post second). If a paste simply uploaded the file the way "Attach files" does, every upload would write its own
`issue.attachment_added` event and notify the people on the issue before anyone had posted anything, and a draft that is never posted would still have notified them.

## Decisions (agreed)

1. **Draft uploads.** A pasted or dropped image is uploaded at once as a draft: no event, no notification, not shown in the issue's file list. One new column on `attachments` marks a draft (a small migration, default false), because
   "no comment" already means "attached to the issue directly" for the file button.
2. **The stored text refers to the file:** `![name](attachment:<id>)`, inside the same body field (no new field). The shared reader (`parseCommentMarkdown`) learns one new node, an image that accepts ONLY our own attachment ids and never an outside address, so the
   safe-subset rule of ADR 0056 holds (no HTML, no external URLs).
3. **Posting links the files.** On create and on edit the server reads the references in the body and checks that each file belongs to this issue (and so this organization), is a draft or already belongs to this comment, and was uploaded by the same person. It links the files to the
   comment in the same transaction as the comment. A bad reference is a 400 with a clear code. At most 10 inline images per comment (the owner's limit).
4. **Abandoned drafts** (pasted, never posted) are deleted when older than 24 hours, opportunistically on the next upload (there is no job runner), like the demo cleanup.
5. **The editor, like a chat app.** Paste (clipboard files) and drop of an image file: an immediate preview from the local file with a quiet progress state, swapped for the real image when the upload ends; a failure (too big, wrong type) becomes a small inline error that can be removed;
   several at once; Ctrl+Z removes a placeholder. Images pasted as page content (not files) are ignored for now.
6. **After posting:** the image is drawn in the comment text; a click opens the existing zoom popup; images referenced inline do not repeat in the thumbnail strip under the comment; the short-lived signed links are refetched when they expire (as the preview popup does).
7. **Editing** a comment follows the same rules (a paste in the edit box is a draft too). Removing the picture from the text leaves the file attached to the issue (named limit). Deleting a comment keeps its files as plain attachments, as today.
8. **Only images are inline** (png, jpeg, gif, webp: no SVG). Other files keep "Attach files".

## Slices (one per session)

1. **Server and format:** the draft column and migration, the contract and reader change, linking on create and edit, the cleanup, API and reader tests.
2. **The editor:** the paste and drop handlers with the placeholder, the image node, drawing the image in comments, the zoom popup, one browser test.
3. **The description** (a separate decision, after 2): the description is a plain text box; it would become the rich editor, and the issue page would draw Markdown instead of plain text, with care for existing plain descriptions and their line breaks.

## Slice 1 as built

- `attachments.draft` (migration 0031). A draft is uploaded with the multipart field `draft=true` to the existing attachments endpoint; images only (`draft_not_image`), never together with a `commentId`.
- A draft writes no event and no notification, is left out of the issue's file list, and deleting one is silent too. Drafts older than 24 hours are deleted (rows and files) at the start of the next draft upload; a failure there is logged and does not fail the upload.
- `parseCommentMarkdown` has an `image` node only for `![name](attachment:<uuid>)`; `inlineImageIds(body)` lists the ids from the same reader, so what is linked is exactly what is drawn. Until slice 2 the web app draws the node as `[name]`.
- Create and edit check each id (real file on this issue, same uploader, an image type, a draft or already this comment's, at most 10): `invalid_inline_image` / `too_many_inline_images`, both 400, nothing saved. The repository then links them in the comment's own transaction, with the same conditions repeated in the UPDATE.
- Named limit: a picture removed from the text on edit stays attached to the issue (as decided in 7). A draft deleted by cleanup while its text is still being written would be refused at posting (`invalid_inline_image`).

## Tests (lean, no pixel checks)

Reader: accepts `attachment:<uuid>`, rejects any other address or scheme. API: a draft upload writes no event and no notification; creating a comment links the drafts; a reference to another issue's file, to another person's draft, or to an unknown id is refused; an expired draft is deleted on the next
upload; an edit can add a reference. Browser: paste an image, see it in the editor, post, see it in the comment.

## Risks and not yet decided

- The object storage has a free-tier limit, and screenshots add up.
- Safari and phone clipboards behave differently from desktop Chrome: to be tested.
- The description editor (slice 3) is the largest piece and may become its own ADR.
