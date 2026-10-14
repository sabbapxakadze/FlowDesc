import { useState } from "react";
import { CircleHelp } from "lucide-react";
import { Button, buttonVariants, Dialog, IconButton } from "../../../shared/ui";

const PACKAGE_URL = "https://www.npmjs.com/package/flowdesc-mcp";

/** Placeholders only: the real secret is never put into a command that can be copied from this page. */
const CLAUDE_CODE_COMMAND = "claude mcp add --env FLOWDESC_TOKEN=fd_pat_YOUR_TOKEN --transport stdio flowdesc -- npx -y flowdesc-mcp";
const CLAUDE_DESKTOP_CONFIG = `{
  "mcpServers": {
    "flowdesc": {
      "command": "npx",
      "args": ["-y", "flowdesc-mcp"],
      "env": { "FLOWDESC_TOKEN": "fd_pat_YOUR_TOKEN" }
    }
  }
}`;

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-[var(--color-text-muted)]">{label}</span>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => setCopied(true));
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre
        tabIndex={0}
        aria-label={label}
        className="rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-3 text-xs break-words whitespace-pre-wrap"
      >
        <code>{text}</code>
      </pre>
    </div>
  );
}

/**
 * The small "?" beside the Access tokens title (ADR 0071): what a token is for and how to use it, in the order a person does it. It shows
 * placeholders, never a real token. The setup lines are the ones in the package's README (the Claude Code `--env` form is from its docs; the
 * Windows wrapper for `npx` is not verified, so it only points at the package page).
 */
export function McpHelp() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton label="How do I connect an AI app?" onClick={() => setOpen(true)}>
        <CircleHelp size={16} aria-hidden="true" />
      </IconButton>
      {open && (
        <Dialog title="Use FlowDesc from an AI app" onClose={() => setOpen(false)} className="max-w-xl">
          <div className="flex flex-col gap-4 text-sm">
            <p>
              An access token lets an AI app such as Claude use your projects and issues, as you, through a small free program called{" "}
              <strong>flowdesc-mcp</strong>. A <strong>read-only</strong> token (the default) can only look. A token with{" "}
              <strong>write access</strong> can also create an issue, change one and add a comment, one issue at a time; changes made that way show
              &ldquo;via token&rdquo; in the history. Neither kind can delete anything.
            </p>
            <ol className="flex list-decimal flex-col gap-3 pl-5">
              <li>
                <strong>Create a token</strong> in the form on this page. Choose Read only unless you want the AI to make changes. Copy it straight
                away: it is shown once.
              </li>
              <li>
                <strong>Install Node.js</strong> (version 22 or newer) if you do not have it. The program runs on your own computer.
              </li>
              <li>
                <strong>Add it to your AI app.</strong> Replace <code>fd_pat_YOUR_TOKEN</code> with the token you copied.
                <CopyBlock label="Claude Code (run in a terminal)" text={CLAUDE_CODE_COMMAND} />
                <CopyBlock label="Claude Desktop (Settings, Developer, Edit Config)" text={CLAUDE_DESKTOP_CONFIG} />
              </li>
              <li>
                <strong>Ask it something</strong>, for example &ldquo;What is overdue in WEB?&rdquo; or &ldquo;Summarise what happened on WEB-12&rdquo;.
                The MCP dot in the sidebar turns green while it is being used.
              </li>
              <li>
                <strong>Revoke the token</strong> here when you stop using it. It stops working at once.
              </li>
            </ol>
            <p className="rounded-[var(--radius-control)] border border-[var(--color-border-default)] p-3 text-[var(--color-text-muted)]">
              Treat a token like a password: anyone who has it can read your FlowDesc data (and change it, with write access) until you revoke
              it. Issue text is written by other people, and an AI app can be influenced by what it reads, so only connect apps you trust, and
              give write access only to ones you watch.
            </p>
            <p>
              More detail, other apps and troubleshooting (including Windows) are on the{" "}
              <a href={PACKAGE_URL} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "link" })}>
                package page on npm
              </a>
              .
            </p>
          </div>
        </Dialog>
      )}
    </>
  );
}
