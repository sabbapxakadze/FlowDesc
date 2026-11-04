import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ArrowUp, Check, Copy, Sparkles, X } from "lucide-react";
import { ASK_MAX_QUESTION, type AskSource } from "@flowdesc/contracts";
import { issuePath } from "../../../shared/lib/paths";
import { Button, cn, IconButton, SidePanel, STATUS_DOT_CLASSES, STATUS_LABELS, Textarea, useExitPresence } from "../../../shared/ui";
import { chatToText, describeLimits, parseSourceKey, splitAnswer } from "../lib/answer";
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
    <SidePanel label="Ask FlowDesc" variant="card" closing={closing} onClose={() => setOpen(false)}>
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
  const [copy, setCopy] = useState<"idle" | "done" | "failed">("idle");
  const copyChat = async () => {
    try {
      await navigator.clipboard.writeText(chatToText(messages));
      setCopy("done");
    } catch {
      setCopy("failed"); // no permission, or an insecure page
    }
    window.setTimeout(() => setCopy("idle"), 2500);
  };

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
        <Avatar />
        <h2 className="font-display flex-1 text-lg">Ask FlowDesc</h2>
        {messages.length > 0 && (
          <Button type="button" variant="link" size="sm" disabled={pending} onClick={clear}>
            New chat
          </Button>
        )}
        {messages.length > 0 && (
          <IconButton label={copy === "done" ? "Chat copied" : copy === "failed" ? "Could not copy" : "Copy chat"} onClick={() => void copyChat()}>
            {copy === "done" ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
          </IconButton>
        )}
        <IconButton label="Close Ask FlowDesc" onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </IconButton>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-[var(--color-bg-lane)] px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex flex-col gap-4 text-sm">
            <div className="flex items-start gap-2">
              <Avatar />
              <p className={cn(CARD, "max-w-[88%]")}>
                Hi! Ask me about your organization&rsquo;s issues and comments, in plain words. You can use issue keys such as WEB-12.
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              {EXAMPLES.map((example) => (
                <Button
                  key={example}
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="rounded-full"
                  disabled={pending}
                  onClick={() => submit(example)}
                >
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
              <div className="flex items-start gap-2">
                <Avatar />
                <p role="status" className={cn(CARD, "flex items-center gap-1.5 text-[var(--color-text-muted)]")}>
                  <span className="sr-only">Looking through your issues…</span>
                  {[0, 150, 300].map((delay) => (
                    <span
                      key={delay}
                      aria-hidden="true"
                      style={{ animationDelay: `${delay}ms` }}
                      className="h-1.5 w-1.5 animate-pulse rounded-full bg-current motion-reduce:animate-none"
                    />
                  ))}
                </p>
              </div>
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
            {/* A pill: the box and the round send button share one rounded border, which lights up when the box has focus. */}
            <div className="flex items-end gap-2 rounded-[1.5rem] border border-[var(--color-border-input)] bg-[var(--color-bg-surface)] py-1.5 pr-1.5 pl-4 focus-within:border-[var(--color-border-focus)] focus-within:outline-2 focus-within:outline-offset-1 focus-within:outline-[var(--color-border-focus)]">
              {/* 16px on a phone: a smaller size makes iOS zoom the page in when the box is focused. */}
              <Textarea
                ref={input}
                aria-label="Your question"
                rows={1}
                maxLength={ASK_MAX_QUESTION}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Ask about your issues…"
                className="max-h-32 min-h-[2.25rem] flex-1 resize-none self-center border-0 bg-transparent px-0 py-1.5 text-base focus:border-0 focus-visible:outline-0 sm:text-sm"
              />
              <Button
                type="submit"
                variant="create"
                aria-label="Ask"
                pending={pending}
                disabled={draft.trim() === "" || pending}
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full p-0"
              >
                <ArrowUp aria-hidden="true" size={18} />
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
      <p className="max-w-[85%] self-end rounded-[1.25rem] rounded-br-md bg-[var(--color-bg-action-primary)] px-3.5 py-2 text-sm break-words whitespace-pre-wrap text-[var(--color-text-on-action)]">
        {message.text}
      </p>
    );
  }
  if (message.kind === "problem") {
    return (
      <div className="flex items-start gap-2">
        <Avatar />
        <p role="alert" className={cn(CARD, "max-w-[88%] border-[var(--color-text-danger)] text-[var(--color-text-danger)]")}>
          {message.text}
        </p>
      </div>
    );
  }
  return <Answer text={message.text} sources={message.sources} />;
}

/**
 * FlowDesc's side of the chat: a white card with a hairline border and a soft shadow on the tinted conversation area, its top-left corner square so it
 * points at the avatar. Relaxed line height, because answers are sentences to read, not labels.
 */
const CARD =
  "min-w-0 rounded-2xl rounded-tl-md border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-4 py-3 text-sm leading-relaxed break-words whitespace-pre-wrap shadow-sm";

/** FlowDesc's mark beside its messages. Decorative: the message text says who is speaking by being in the log. */
function Avatar() {
  return (
    <span
      aria-hidden="true"
      className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg-action-create)] text-[var(--color-text-on-action-strong)]"
    >
      <Sparkles size={14} />
    </span>
  );
}

function Answer({ text, sources }: { text: string; sources: AskSource[] }) {
  const { setOpen } = useAsk();
  const parts = splitAnswer(text, sources);
  return (
    <div className="flex items-start gap-2.5">
      <Avatar />
      <div className="min-w-0 max-w-[92%] flex-1">
        <p className="mb-1 text-xs font-medium text-[var(--color-text-muted)]">FlowDesc</p>
        <div className={cn(CARD, "flex flex-col gap-3 whitespace-normal")}>
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
            <div className="border-t border-[var(--color-border-default)] pt-3">
              <p className="mb-2 text-[0.6875rem] font-medium tracking-wide text-[var(--color-text-muted)] uppercase">
                Sources <span aria-hidden="true">&middot; {sources.length}</span>
              </p>
              <ul className="flex flex-col gap-1.5">
                {sources.map((source) => (
                  <li key={source.n} className="min-w-0">
                    <Chip source={source} onFollow={() => setOpen(false)} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
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
      <span className="min-w-0 flex-1 truncate">{source.title}</span>
      <span className="shrink-0 text-[var(--color-text-muted)]">
        <span className="sr-only">, </span>
        {STATUS_LABELS[source.status]}
      </span>
    </>
  );
  const classes = compact
    ? "mx-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--color-bg-action-create)_16%,transparent)] px-1 text-xs leading-5 font-medium align-baseline text-[var(--color-text-link)] no-underline hover:bg-[color-mix(in_srgb,var(--color-bg-action-create)_30%,transparent)]"
    : "flex w-full items-center gap-2 rounded-lg border border-[var(--color-border-default)] px-2.5 py-1.5 text-xs no-underline transition-colors hover:border-[var(--color-border-input)] hover:bg-[var(--color-bg-lane)]";
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
