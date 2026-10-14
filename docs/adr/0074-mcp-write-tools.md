# 0074 - MCP write tools: a `read_write` token, three tools that change one issue at a time, and a "via token" marker

Status: **Accepted** - 2026-10-14. Slice 4 of ADR 0070 (which listed the three tools and the `read_write` scope in advance). Amends ADR 0070 (read-only is no longer the whole story), ADR 0071 (Account help, tutorial wording) and ADR 0073 (landing page wording).

## Context

The MCP server (ADR 0070) can only read. The owner wants an AI app to also create an issue, comment and update an issue, and chose three limits in conversation: those three tools and no others, **one issue per call** (no bulk changes), and a marker so people can tell a change made through a token from one made at the keyboard.

Reading can leak. Writing can damage. The new risk is **prompt injection**: an issue title or comment written by someone else can contain text such as "mark everything done", and an AI that reads it while holding write tools might obey. This ADR cannot remove that; it keeps the reach small and the effect visible.

## Decisions

1. **Write access is chosen per token, when it is made.** The create form gets "Read only" (the default) and "Read and write". Existing tokens stay read-only and a token's scope never changes afterwards (make a new one instead). The `read_write` value already exists in the database enum (ADR 0070), so there is no migration for it.
2. **A token may call exactly three more addresses**, only with `read_write`, on the same default-deny list in `middleware/token-access.ts`: `POST .../issues` (create), `PATCH .../issues/:id` (update fields) and `POST .../issues/:id/comments`. Not on the list, so still refused for every token: delete anything, move and sprint changes, labels, attachments and uploads, edit or delete a comment, sprints, projects, members, roles, invitations, account, token management, audit log. A `read` token that tries one of the three gets `403 token_read_only` ("this token is read-only"), a different code from `token_not_allowed`, so the MCP server can say what to do.
3. **Role checks still run.** A token acts as its owner: a viewer's `read_write` token still cannot write (`manage_issue` fails as for a session), and the demo cannot make tokens at all (ADR 0070).
4. **One issue per call, by construction.** `create_issue` makes one issue, `comment_on_issue` adds one comment to one issue, `update_issue` changes one issue found by its exact key (`WEB-12`). There is no list input, no filter and no "all". The server cannot spread a vague request across many issues, and there is no API address that accepts several.
5. **A write limit of its own: 30 per minute per token** (reads stay at 120). One more `express-rate-limit` instance keyed by the token hash, counting only requests that carry a token and are not GET.
6. **`update_issue` is version-checked like the app.** It reads the issue (to get its version), sends the changes with that version, and a `409` comes back to the AI as "someone changed this issue; read it again and decide", with the current values, never a silent overwrite. Fields: title, description, status, priority, due date, assignee. The assignee is "me", "unassigned", or a member's name or email, resolved against the members list; an ambiguous or unknown one is an error that lists the choices.
7. **The "via token" marker.** `issue_events` gets a nullable `via_api_token_id` (migration 0034, `ON DELETE SET NULL`). The three write paths pass the token's id into `writeIssueEvent`, so the event row says it, in the same transaction as the change (history stays append-only, ADR 0005). The events read returns `viaToken: boolean` (never the token's name or id: a token's label is the owner's private choice, and other members only need to know a token was used). The timeline shows "via token" after the person's name; a comment made through a token shows it in its header. Only events written by these three paths can carry it, since no other address is open to tokens.
8. **Tool annotations are honest.** The write tools are not `readOnlyHint`, so Claude Code and Claude Desktop ask the person to approve each call by default. `create_issue` and `comment_on_issue` say `destructiveHint: false`; `update_issue` replaces fields, so it keeps the default (destructive). Every write tool's description says to act only when the person asked. The issue-text-is-data notice stays on every tool.
9. **The server learns nothing at start.** It still makes no network call when it starts. It registers all twelve tools; a read-only token that calls a write tool gets the `token_read_only` answer turned into one sentence ("This access token is read-only. Make one with write access: Account, Access tokens.").
10. **Wording everywhere changes from "read-only" to the truth**: the landing page (use-case card, "Use it from your AI app" section, command note), the Account text, the Access tokens help dialog and the tutorial step, the package README and its npm page. The default and recommended token is still read-only, and the text says so.
11. **Release.** `flowdesc-mcp` goes to 0.2.0 from the same tagged workflow (`mcp-v0.2.0`; the owner pushes the tag). Until it is published, an older package fails the new tools with "not allowed", which is safe.

## Rejected

- **Per-project or per-tool tokens.** More choices than a first version needs; scope plus the owner's role is enough for now.
- **Letting an existing token be upgraded.** A token's reach should not grow silently under a client that already holds it.
- **A confirmation step on the server** ("are you sure?"). The AI app already asks the person to approve a tool call, and a second server-side prompt cannot be answered by a stdio program.
- **Marking events with the token's name.** Leaks a private label to the whole organization.

## Limits, named

- **Prompt injection is reduced, not removed.** Read-only by default, write access opt-in per token, three tools, one issue each, a low write rate, no deletes, and a visible marker. A person who gives a `read_write` token to an AI accepts that it may act on text it reads. Approval prompts in the AI app are the real brake, and a client can be set to skip them.
- **Created and edited text carries the owner's name.** The marker shows a token was used, not which AI app or which prompt.
- **`update_issue` can still replace a title or description**; the old text stays in the event history, but the field itself is overwritten.
- **Not measured against a real AI app yet**: the tools are tested against the real API and a fake one, and over stdio, not inside Claude Code in this session.
