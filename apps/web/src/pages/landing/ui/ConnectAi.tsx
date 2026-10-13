import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button, buttonVariants } from "../../../shared/ui";
import { SectionHeading } from "./SectionHeading";

const PACKAGE_URL = "https://www.npmjs.com/package/flowdesc-mcp";

/** A placeholder, never a real token: the visitor makes their own on the Account page. */
const COMMAND = "claude mcp add --env FLOWDESC_TOKEN=fd_pat_YOUR_TOKEN --transport stdio flowdesc -- npx -y flowdesc-mcp";

function CopyCommand() {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3">
      <pre
        tabIndex={0}
        aria-label="Command to add FlowDesc to Claude Code"
        className="rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-3 text-xs break-words whitespace-pre-wrap"
      >
        <code>{COMMAND}</code>
      </pre>
      <div className="mt-2 flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="bg-[var(--color-bg-surface)]"
          onClick={() => {
            void navigator.clipboard.writeText(COMMAND).then(() => setCopied(true));
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}

/**
 * "Use it from your AI app" (ADR 0073): FlowDesc has an MCP server, so an AI app such as Claude can read a person's projects and issues.
 * Three cards like "How it works", and only what is true today: read-only, started from the person's own computer with an access token they
 * make themselves and can revoke. Static: the command shows a placeholder, never a token, and nothing here calls the API.
 */
export function ConnectAi() {
  return (
    <section aria-labelledby="landing-ai" className="mx-auto mt-20 w-full max-w-6xl px-4 sm:mt-28 sm:px-6">
      <SectionHeading id="landing-ai" title="Use it from your AI app">
        FlowDesc has an MCP server, so an AI app such as Claude can read your projects and issues. It only reads: it can never change anything.
      </SectionHeading>
      <ol className="mt-10 grid gap-4 md:grid-cols-3 md:gap-10">
        <li className="glass-card relative rounded-[var(--radius-card)] p-6 sm:p-7">
          <span aria-hidden="true" className="relative flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-bg-action-create)] text-sm font-semibold text-[var(--color-text-on-action-strong)]">
            1
          </span>
          <h3 className="relative mt-4 text-lg font-semibold">Make a token</h3>
          <p className="relative mt-2 text-[var(--color-text-muted)]">
            In your account, open Access tokens and make a read-only one. It is shown once, and you can revoke it whenever you like.
          </p>
          <span aria-hidden="true" className="absolute top-1/2 -right-8 hidden w-6 -translate-y-1/2 justify-center text-[var(--color-text-link)] md:flex">
            <ChevronRight size={26} />
          </span>
        </li>
        <li className="glass-card relative min-w-0 rounded-[var(--radius-card)] p-6 sm:p-7">
          <span aria-hidden="true" className="relative flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-bg-action-create)] text-sm font-semibold text-[var(--color-text-on-action-strong)]">
            2
          </span>
          <h3 className="relative mt-4 text-lg font-semibold">Add one command</h3>
          <p className="relative mt-2 text-[var(--color-text-muted)]">Run this in a terminal, with your token in place of the placeholder.</p>
          <CopyCommand />
          <span aria-hidden="true" className="absolute top-1/2 -right-8 hidden w-6 -translate-y-1/2 justify-center text-[var(--color-text-link)] md:flex">
            <ChevronRight size={26} />
          </span>
        </li>
        <li className="glass-card relative rounded-[var(--radius-card)] p-6 sm:p-7">
          <span aria-hidden="true" className="relative flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-bg-action-create)] text-sm font-semibold text-[var(--color-text-on-action-strong)]">
            3
          </span>
          <h3 className="relative mt-4 text-lg font-semibold">Ask</h3>
          <p className="relative mt-2 text-[var(--color-text-muted)]">
            &ldquo;What is overdue in WEB?&rdquo; &ldquo;What happened on WEB-12?&rdquo; &ldquo;How did our last sprints go?&rdquo;
          </p>
        </li>
      </ol>
      <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-[var(--color-text-muted)]">
        Read-only, and you stay in control: revoke the token and it stops at once. Works with Claude Code and Claude Desktop; setup details are on the{" "}
        <a href={PACKAGE_URL} target="_blank" rel="noreferrer" className={buttonVariants({ variant: "link" })}>
          flowdesc-mcp page on npm
        </a>
        .
      </p>
    </section>
  );
}
