# flowdesc-mcp

An [MCP](https://modelcontextprotocol.io) server that lets an AI app (Claude Code, Claude Desktop and others) **read** your
FlowDesc projects and issues and, if you allow it, **create an issue, change one and comment**. It runs on your own computer and talks to
FlowDesc with a personal access token. A token is **read-only unless you make it with write access**, a write changes **one issue at a
time**, and nothing can **delete** anything: the FlowDesc API itself enforces all of this, not only this program.

> Needs Node.js 22 or newer (tested on Node 24; 22 is not tested). MIT licence (this package only; the rest of the FlowDesc repository
> has its own LICENSE). Start it with `npx -y flowdesc-mcp` (published on npm, with a provenance record that links each version to its
> source commit). To work on it, or to run an unreleased change, use "Run it from the source" below.

## 1. Get a token

In FlowDesc open **Account**, then **Access tokens**, give it a name (for example "Claude on my laptop"), choose **Read only** (the default) or
**Read and write**, choose how long it lasts, and press **Create token**. Copy the secret (it starts with `fd_pat_`). It is shown **once**: FlowDesc keeps only a hash, so it cannot
show it again. Treat it like a password. You can revoke it on the same page at any time; it stops working immediately.

## 2. Connect your AI app

The server reads two environment variables:

| Variable | Meaning |
| --- | --- |
| `FLOWDESC_TOKEN` | Required. Your `fd_pat_...` token. |
| `FLOWDESC_URL` | Optional. Defaults to `https://flowdesc.app`. Plain `http://` is accepted only for `localhost`, so a token never travels unencrypted to another machine. |

**Claude Code** (syntax from the Claude Code docs, `claude mcp add [options] <name> -- <command> [args...]`):

```
claude mcp add --env FLOWDESC_TOKEN=fd_pat_YOUR_TOKEN --transport stdio flowdesc -- npx -y flowdesc-mcp
claude mcp list
```

To point it at a FlowDesc running on your own machine add `--env FLOWDESC_URL=http://localhost:4000` as well (whether repeating
`--env` works in your version is **not verified**; the docs say `--env` takes several `KEY=value` pairs). On Windows, if `npx` is not
found by Claude Code, a `cmd /c npx ...` wrapper is sometimes needed: **not verified** (the docs page could not be read that far).

**Claude Desktop** (file `%APPDATA%\Claude\claude_desktop_config.json` on Windows, `~/Library/Application Support/Claude/claude_desktop_config.json`
on macOS; open it from Settings, Developer, Edit Config):

```json
{
  "mcpServers": {
    "flowdesc": {
      "command": "npx",
      "args": ["-y", "flowdesc-mcp"],
      "env": { "FLOWDESC_TOKEN": "fd_pat_YOUR_TOKEN" }
    }
  }
}
```

Quit Claude Desktop completely and start it again. If the server does not show up, its messages are in
`%APPDATA%\Claude\logs\mcp-server-flowdesc.log` (Windows).

### Run it from the source (to work on it, or to run a change that is not released yet)

```
pnpm install
pnpm --filter flowdesc-mcp build
```

Then use `node` and the full path to `apps/mcp/dist/index.js` in place of `npx -y flowdesc-mcp` above (on Windows, forward slashes work in
the Claude Code command; in the Claude Desktop JSON write the backslashes doubled).

## What it can do

Twelve tools: nine only read, and three (the last three in the table) change one issue at a time and need a token with write access.

| Tool | Answers |
| --- | --- |
| `whoami` | Which person and organization the token acts as, and the role. |
| `list_projects` | Projects with open / in progress / overdue / done counts and the running sprint. |
| `list_issues` | A project's issues, filtered by status, priority, due (overdue or none), assignee (`me`, `unassigned`), labels (by name), sorted, paged with a cursor. |
| `get_issue` | One issue (`WEB-12`) with its labels and full history including comments. |
| `search_issues` | Search titles and descriptions across the organization. |
| `get_sprints` | A project's sprints. |
| `get_backlog` | The backlog in order and the active sprint's issues. |
| `get_analytics` | Throughput, cycle time, sprint velocity, or the status and label breakdown. |
| `get_my_work` | Your open assigned issues, or how this week's due issues are going. |
| `create_issue` | **Write.** Makes one issue in a project (status todo), with an optional description. |
| `comment_on_issue` | **Write.** Adds one comment to one issue (`WEB-12`). |
| `update_issue` | **Write.** Changes one issue: title, description, status, priority, due date, assignee (`me`, `unassigned`, an email or a full name). Version-checked: if someone changed the issue after it was read, nothing is saved and the answer says what it is now. |

Try asking: "What is overdue in WEB?", "Summarise what happened on WEB-12", "How did our last sprints go?". With a write token: "Add an issue to WEB for the broken footer link", "Move WEB-12 to in progress and assign it to me".

## Safety, plainly

- **Read-only is the default.** A token made with "Read only" is refused on every write address by the FlowDesc API (not only here). Write access is a choice you make when you create the token, and the token's scope never changes afterwards.
- **Writes are small.** Three tools, one issue per call (no tool takes a list), a limit of 30 writes a minute per token, and no deleting, moving between sprints, labels, files, members or account changes. Everything a write makes or changes shows "via token" in the issue's history, and your AI app may ask you to approve each call (check its settings).
- **It sees what you see.** A token acts as its owner and never gets more than their role; it cannot reach other organizations.
- **Issue text is other people's text.** Titles, descriptions and comments can contain instructions aimed at an AI ("ignore your
  rules and..."). The tools say that this is data. With a read-only token the worst case is that it reads something you could read; with write access it
  could be steered into creating or changing an issue, so give write access only to apps you trust and watch.
- **The token stays on your machine.** It is passed through the environment, never printed, and removed from any error message.
  Anyone who has it can read your FlowDesc data (and change it, with write access) until you revoke it, so do not paste it into chats or commit it.
- The token's limits: it works for the time you chose (30 days, 90 days or a year), and each token may make 120 requests a minute, of which 30 can be writes.

## Troubleshooting

| You see | Meaning |
| --- | --- |
| `FLOWDESC_TOKEN is not set` | The app did not pass the token. Check the `env` / `--env` part. |
| `does not look like a FlowDesc access token` | The value must start with `fd_pat_`. |
| `rejected the access token` | Wrong, revoked or expired. Create a new one on the Account page. |
| `Could not reach FlowDesc` | Wrong `FLOWDESC_URL`, or no connection. |
| `No project "X". Projects you can see: ...` | Use one of the listed keys. |
| `This access token is read-only` | A write tool was used with a read-only token. Make a new token with **Read and write** (Account, Access tokens). |
| `Someone changed this issue after it was read` | `update_issue` saved nothing because the issue changed in between. Read it again and decide. |
| `Cut: the answer was N characters` | The answer was long. Ask for less: a smaller limit, a filter, the next page. |

## For developers

- `pnpm --filter flowdesc-mcp build` compiles to `dist/` (used by the tests and when running from source). `pnpm --filter flowdesc-mcp bundle`
  makes `bundle/index.js`, the single file that is published (the private contracts package is inlined; the MCP SDK and zod stay normal
  dependencies). `src/index.ts` is the program, `src/server.ts` builds the server,
  `src/tools.ts` has the tools, `src/client.ts` the only code that talks to the network.
- Tests: `pnpm test` runs this package's (a pretend FlowDesc API, in memory and as a real child process over stdio) and, in
  `apps/api`, a test that drives every tool against the real API and database.
- stdout is the protocol channel: never `console.log` here, log to stderr only.
- **Releasing** (the owner): change `version` in `apps/mcp/package.json` and commit; `git tag mcp-vX.Y.Z` (the number must equal the version);
  `git push origin mcp-vX.Y.Z`. The workflow `.github/workflows/publish-mcp.yml` refuses a tag that does not match, runs the tests and
  publishes with npm trusted publishing (no npm token is stored in GitHub).
- Design and decisions: `docs/adr/0070-mcp-server-and-access-tokens.md`.
