import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Sparkles, X } from "lucide-react";
import { ASK_MAX_QUESTION, type AskSource } from "@flowdesc/contracts";
import { issuePath } from "../../../shared/lib/paths";
import { Button, cn, IconButton, SidePanel, STATUS_DOT_CLASSES, STATUS_LABELS, Textarea, useExitPresence } from "../../../shared/ui";
import { describeLimits, parseSourceKey, splitAnswer } from "../lib/answer";
import { MAX_QUESTIONS_PER_CHAT, type AskMessage } from "../model/ask-context";
import { useAsk, useAskEnabled } from "../model/useAsk";

const EXAMPLES = ["What is overdue?", "What is in progress?", "What is assigned to me?"];

/**
 * "Ask FlowDesc" (ADR 0077): a chat in the app's right-hand panel (a full-screen sheet on a phone) that answers from the organization's issues
 * and comments. Everything shown here is plain text or a link the app builds itself: the answer is never put in the page as HTML, and a
 * citation is a link to an issue only when the server listed that issue as a source.
 *
 * One right-hand panel at a time: opening an issue in the issue panel closes this one (the chat is kept, and shows again when reopened),
 * and opening this one closes the issue panel (a click outside it, which the issue panel already understands).
 */
export function AskPanel() {
  const enabled = useAskEnabled();
  const { open, setOpen } = useAsk();
  const { rendered, closing } = useExitPresence(open && enabled, 220);

  // Close when an issue is newly opened in the issue panel. Only a CHANGE counts: the click that opens this panel also closes the issue panel,
  // but a moment later, and the address still names the old issue until then.
  const [searchParams] = useSearchParams();
  const issueRef = searchParams.get("issue");
  const lastIssueRef = useRef(issueRef);
  useEffect(() => {
    if (issueRef && issueRef !== lastIssueRef.current) setOpen(false);
    lastIssueRef.current = issueRef;
  }, [issueRef, setOpen]);

  // The other direction: opening this panel closes the issue panel by dropping `?issue=`. (The issue panel's own "click outside closes me" does not
  // do it, because this panel's row is marked as a panel trigger, so that the row can toggle this panel.) Read from the live address, like useIssuePanel.
  const navigate = useNavigate();
  useEffect(() => {
    if (!open) return;
    const next = new URLSearchParams(window.location.search);
    if (!next.has("issue")) return;
    next.delete("issue");
    navigate({ pathname: window.location.pathname, search: next.toString() }, { replace: true });
  }, [open, navigate]);

  if (!rendered) return null;
  return (
    <SidePanel label="Ask FlowDesc" closing={closing} onClose={() => setOpen(false)}>
      <AskContent onClose={() => setOpen(false)} />
    </SidePanel>
  );
}

function AskContent({ onClose }: { onClose: () => void }) {
  const { messages, pending, limits, questionsAsked, send, clear } = useAsk();
  const [draft, setDraft] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const chatFull = questionsAsked >= MAX_QUESTIONS_PER_CHAT;

  // Focus the box when the panel opens, but not on a touch screen: it would raise the keyboard over the answer before the person has chosen to type.
  // (A timer, because the panel moves focus to itself after this runs.)
  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    const timer = window.setTimeout(() => input.current?.focus({ preventScroll: true }), 0);
    return () => window.clearTimeout(timer);
  }, []);

  // Keep the newest message in view.
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length, pending]);

  const submit = (text: string) => {
    const question = text.trim();
    if (!question || pending || chatFull) return;
    setDraft("");
    void send(question);
  };
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit(draft);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Enter sends, Shift+Enter makes a new line. Not while an input method (a phone keyboard's suggestion, an IME) is still composing.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit(draft);
    }
  };

  return (
    <>
      <header className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border-default)] px-4 py-3">
        <Sparkles aria-hidden="true" size={16} className="text-[var(--color-text-muted)]" />
        <h2 className="font-display flex-1 text-lg">Ask FlowDesc</h2>
        {messages.length > 0 && (
          <Button type="button" variant="link" size="sm" disabled={pending} onClick={clear}>
            New chat
          </Button>
        )}
        <IconButton label="Close Ask FlowDesc" onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </IconButton>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-4 text-sm">
            <p>Ask about your organization&rsquo;s issues and comments, in plain words. You can use issue keys such as WEB-12.</p>
            <div className="flex flex-col items-start gap-2">
              {EXAMPLES.map((example) => (
                <Button key={example} type="button" variant="secondary" size="sm" disabled={pending} onClick={() => submit(example)}>
                  {example}
                </Button>
              ))}
            </div>
            <Privacy />
          </div>
        ) : (
          <div role="log" aria-live="polite" aria-label="Conversation" className="flex flex-col gap-4">
            {messages.map((message) => (
              <Message key={message.id} message={message} />
            ))}
            {pending && (
              <p role="status" className="text-sm text-[var(--color-text-muted)]">
                Looking through your issues…
              </p>
            )}
            <div ref={end} />
          </div>
        )}
      </div>

      <form
        onSubmit={onSubmit}
        className="flex shrink-0 flex-col gap-2 border-t border-[var(--color-border-default)] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      >
        {chatFull ? (
          <p className="text-sm text-[var(--color-text-muted)]">
            This chat has {MAX_QUESTIONS_PER_CHAT} questions. Start a new chat to ask more.{" "}
            <Button type="button" variant="link" size="sm" onClick={clear} disabled={pending}>
              New chat
            </Button>
          </p>
        ) : (
          <>
            <div className="flex items-end gap-2">
              {/* 16px on a phone: a smaller size makes iOS zoom the page in when the box is focused. */}
              <Textarea
                ref={input}
                aria-label="Your question"
                rows={2}
                maxLength={ASK_MAX_QUESTION}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Ask about your issues…"
                className="min-h-[2.75rem] flex-1 resize-none text-base sm:text-sm"
              />
              <Button type="submit" variant="create" pending={pending} disabled={draft.trim() === "" || pending}>
                Ask
              </Button>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-[var(--color-text-muted)]">
              <span>{limits ? describeLimits(limits) : "Enter to send, Shift+Enter for a new line"}</span>
              {draft.length >= ASK_MAX_QUESTION - 100 && (
                <span aria-live="polite">
                  {draft.length}/{ASK_MAX_QUESTION}
                </span>
              )}
            </div>
          </>
        )}
      </form>
    </>
  );
}

/** What happens to a question, in the words the person needs. Only what is true today (ADR 0077): the provider's own retention is not claimed. */
function Privacy() {
  return (
    <p className="text-xs text-[var(--color-text-muted)]">
      Your question and the issues and comments it matches are sent to Cloudflare&rsquo;s AI service to write the answer. FlowDesc does not save
      them, and this chat exists only on this screen. Answers can be wrong: check the issues they link to.
    </p>
  );
}

function Message({ message }: { message: AskMessage }) {
  if (message.kind === "question") {
    return (
      <p className="max-w-[85%] self-end rounded-[var(--radius-card)] bg-[var(--color-bg-action-primary)] px-3 py-2 text-sm break-words whitespace-pre-wrap text-[var(--color-text-on-action)]">
        {message.text}
      </p>
    );
  }
  if (message.kind === "problem") {
    return (
      <p role="alert" className="text-sm break-words text-[var(--color-text-danger)]">
        {message.text}
      </p>
    );
  }
  return <Answer text={message.text} sources={message.sources} />;
}

function Answer({ text, sources }: { text: string; sources: AskSource[] }) {
  const { setOpen } = useAsk();
  const parts = splitAnswer(text, sources);
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p className="break-words whitespace-pre-wrap">
        {parts.map((part, index) =>
          part.kind === "text" ? (
            <span key={index}>{part.text}</span>
          ) : (
            <Chip key={index} source={part.source} compact onFollow={() => setOpen(false)} />
          ),
        )}
      </p>
      {sources.length > 0 && (
        <div>
          <p className="mb-1 text-xs text-[var(--color-text-muted)]">Sources</p>
          <ul className="flex flex-col gap-1">
            {sources.map((source) => (
              <li key={source.n}>
                <Chip source={source} onFollow={() => setOpen(false)} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** A citation: a link to the issue's page when its key is well formed. Following it closes the panel (it would cover the page on a phone); the chat is kept. */
function Chip({ source, compact = false, onFollow }: { source: AskSource; compact?: boolean; onFollow: () => void }) {
  const parsed = parseSourceKey(source.key);
  const body = compact ? (
    <>{source.n}</>
  ) : (
    <>
      <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", STATUS_DOT_CLASSES[source.status])} />
      <span className="font-medium">{source.key}</span>
      <span className="truncate">{source.title}</span>
      <span className="sr-only">, {STATUS_LABELS[source.status]}</span>
    </>
  );
  const classes = compact
    ? "mx-0.5 inline-flex min-w-5 items-center justify-center rounded-full border border-[var(--color-border-input)] px-1 text-xs leading-5 align-baseline no-underline hover:bg-[var(--color-border-default)]"
    : "inline-flex max-w-full items-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border-default)] px-2 py-1 text-xs no-underline hover:bg-[var(--color-border-default)]";
  const label = compact ? `Source ${source.n}: ${source.key}, ${source.title}` : undefined;
  if (!parsed) {
    return (
      <span className={classes} aria-label={label}>
        {body}
      </span>
    );
  }
  return (
    <Link to={issuePath(parsed.projectKey, parsed.number)} onClick={onFollow} aria-label={label} className={classes}>
      {body}
    </Link>
  );
}
