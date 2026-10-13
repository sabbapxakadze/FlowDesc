import { Bot, ListChecks, Timer, TrendingUp, UserCheck, type LucideIcon } from "lucide-react";
import { useState, type ComponentType } from "react";
import { withViewTransition } from "../../../shared/lib/motion";
import { Button } from "../../../shared/ui";
import { SectionHeading } from "./SectionHeading";
import { AiVisual, BacklogVisual, HandoverVisual, ProgressVisual, SprintVisual } from "./UseCaseVisuals";

/** Ways of working the app supports today, written as what a person does, not as claims about who uses it. */
const CASES: { id: string; title: string; text: string; Icon: LucideIcon; Visual: ComponentType }[] = [
  {
    id: "sprint",
    title: "Run a sprint",
    text: "Plan the sprint from the backlog, drag cards as the work moves, complete it, and see the sprint's velocity afterwards.",
    Icon: Timer,
    Visual: SprintVisual,
  },
  {
    id: "backlog",
    title: "Keep the backlog honest",
    text: "Sort by priority, filter by label or due date, and spot what is overdue before it catches you out.",
    Icon: ListChecks,
    Visual: BacklogVisual,
  },
  {
    id: "handover",
    title: "Hand work over cleanly",
    text: "Assign it, mention the person, attach what they need. Everyone involved is notified and sees the same history.",
    Icon: UserCheck,
    Visual: HandoverVisual,
  },
  {
    id: "progress",
    title: "Show progress without a spreadsheet",
    text: "Throughput, cycle time and velocity come from the real history of your issues, so a status update is one page.",
    Icon: TrendingUp,
    Visual: ProgressVisual,
  },
  {
    id: "ai",
    title: "Ask your AI",
    text: "Connect an AI app such as Claude and ask about your projects in plain words. It reads your issues, sprints and numbers as you, and it can never change anything.",
    Icon: Bot,
    Visual: AiVisual,
  },
];

/**
 * Five ways of working as a row of pills, one open at a time (ADR 0067). The pills are buttons inside a list (so the section still has
 * its five items) and say which is open with `aria-pressed`, like the product preview's pills; the open one's text is announced politely when it
 * changes. The picture is a drawn example and is hidden from assistive technology.
 */
export function UseCases() {
  const [selected, setSelected] = useState(CASES[0]!.id);
  const current = CASES.find((item) => item.id === selected) ?? CASES[0]!;
  return (
    <section aria-labelledby="landing-use-cases" className="mx-auto mt-20 w-full max-w-6xl px-4 sm:mt-28 sm:px-6">
      <SectionHeading id="landing-use-cases" title="What people use it for">
        A few ways the same pieces fit together.
      </SectionHeading>
      <ul aria-label="Ways of working" className="mt-10 flex flex-wrap justify-center gap-2.5">
        {CASES.map(({ id, title, Icon }) => (
          <li key={id}>
            <Button
              type="button"
              size="md"
              variant={id === selected ? "create" : "secondary"}
              aria-pressed={id === selected}
              onClick={() => withViewTransition(() => setSelected(id))}
              className={id === selected ? "inline-flex items-center gap-2 rounded-full px-4" : "inline-flex items-center gap-2 rounded-full bg-[var(--color-bg-surface)] px-4"}
            >
              <Icon size={16} aria-hidden="true" />
              {title}
            </Button>
          </li>
        ))}
      </ul>
      <div aria-live="polite" className="glass-card mt-6 grid items-center gap-8 rounded-[var(--radius-card)] p-6 sm:p-10 md:grid-cols-2">
        <div key={current.id}>
          <h3 className="font-display text-3xl leading-tight font-normal">{current.title}</h3>
          <p className="mt-3 text-lg text-[var(--color-text-muted)]">{current.text}</p>
        </div>
        <div aria-hidden="true">
          <current.Visual />
        </div>
      </div>
    </section>
  );
}
