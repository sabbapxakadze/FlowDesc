import { Bell, CalendarClock, Paperclip } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The small pictures next to each way of working (ADR 0067). They are drawn examples, not the live app and not real figures: each says
 * "Example" so nobody reads the numbers as a claim. They are decoration, so the caller hides them from assistive technology.
 */

function ExampleCard({ children, caption }: { children: ReactNode; caption?: string }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-4 text-sm">
      {caption && <p className="mb-2 text-xs text-[var(--color-text-muted)]">{caption}</p>}
      {children}
    </div>
  );
}

function Bars({ heights }: { heights: number[] }) {
  return (
    <div className="flex h-16 items-end gap-1.5">
      {heights.map((height, index) => (
        <span key={index} className="flex-1 rounded-t-sm bg-[var(--color-chart-primary)]" style={{ height: `${height}%` }} />
      ))}
    </div>
  );
}

const CHIP = "inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-border-default)] px-2 py-0.5 text-xs font-medium";

export function SprintVisual() {
  return (
    <div className="grid gap-3">
      <ExampleCard caption="Example">
        <div className="flex items-center justify-between">
          <b>Sprint 5</b>
          <span className={CHIP}>Active</span>
        </div>
        <div className="my-3 flex h-2 gap-0.5 overflow-hidden rounded-full bg-[var(--color-chart-quiet)]">
          <span className="bg-[var(--color-status-done)]" style={{ width: "55%" }} />
          <span className="bg-[var(--color-status-in-progress)]" style={{ width: "20%" }} />
          <span className="bg-[var(--color-status-todo)]" style={{ width: "25%" }} />
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">Done, in progress and to do, counted as the work moves.</p>
      </ExampleCard>
      <ExampleCard caption="Sprint velocity: what each sprint took on, and what it finished">
        <Bars heights={[62, 80, 70, 100, 92]} />
      </ExampleCard>
    </div>
  );
}

export function BacklogVisual() {
  const rows = [
    { title: "Footer links open the wrong page on mobile", note: "Urgent" },
    { title: "Set up redirects from the old blog URLs", note: "Overdue", overdue: true },
    { title: "Add dark mode to the marketing site", note: "Low" },
  ];
  return (
    <ExampleCard caption="Example: sorted by priority, overdue marked">
      <div className="divide-y divide-[var(--color-border-default)]">
        {rows.map((row) => (
          <div key={row.title} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
            <span className="truncate">{row.title}</span>
            <span className={`${CHIP} shrink-0 ${row.overdue ? "text-[var(--color-text-warning)]" : ""}`}>
              {row.overdue && <CalendarClock size={13} aria-hidden="true" />}
              {row.note}
            </span>
          </div>
        ))}
      </div>
    </ExampleCard>
  );
}

export function HandoverVisual() {
  return (
    <div className="grid gap-3">
      <ExampleCard caption="Example">
        <div className="flex gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg-action-create)] text-xs font-semibold text-[var(--color-text-on-action-strong)]">
            AM
          </span>
          <div className="min-w-0">
            <p>
              Can you take the new layout from here, <span className="font-medium text-[var(--color-text-link)]">@Nino</span>? Everything you need is attached.
            </p>
            <span className={`${CHIP} mt-2`}>
              <Paperclip size={13} aria-hidden="true" />
              layout.png
            </span>
          </div>
        </div>
      </ExampleCard>
      <p className="flex items-center gap-2 px-1 text-sm text-[var(--color-text-muted)]">
        <Bell size={16} aria-hidden="true" className="text-[var(--color-text-link)]" />
        Nino is notified as soon as the comment is posted.
      </p>
    </div>
  );
}

export function ProgressVisual() {
  return (
    <ExampleCard caption="Example: weekly throughput, built from what really happened">
      <Bars heights={[30, 45, 38, 62, 55, 80, 70, 92]} />
      <div className="mt-3 flex flex-wrap gap-1.5">
        {["Throughput", "Cycle time", "Velocity"].map((name) => (
          <span key={name} className={CHIP}>
            {name}
          </span>
        ))}
      </div>
    </ExampleCard>
  );
}

/** A question to an AI app that is connected to FlowDesc, and its answer: drawn, not a real conversation (ADR 0073). */
export function AiVisual() {
  const overdue = [
    { key: "WEB-25", title: "Fix layout shift on the homepage hero image", due: "Oct 10" },
    { key: "WEB-18", title: "Set up redirects from the old blog URLs", due: "Oct 7" },
  ];
  return (
    <ExampleCard caption="Example: a question to an AI app connected to FlowDesc">
      <div className="flex justify-end">
        <p className="rounded-2xl rounded-br-sm bg-[var(--color-bg-action-create)] px-3 py-2 text-[var(--color-text-on-action-strong)]">What is overdue in WEB?</p>
      </div>
      <div className="mt-3 rounded-2xl rounded-bl-sm border border-[var(--color-border-default)] p-3">
        <p>Two issues are past their due date:</p>
        <ul className="mt-2 flex flex-col gap-1.5">
          {overdue.map((issue) => (
            <li key={issue.key} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate">
                <b className="font-medium">{issue.key}</b> {issue.title}
              </span>
              <span className={`${CHIP} shrink-0 text-[var(--color-text-warning)]`}>
                <CalendarClock size={13} aria-hidden="true" />
                {issue.due}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-[var(--color-text-muted)]">Read from FlowDesc through an access token.</p>
      </div>
    </ExampleCard>
  );
}

