import { Bell, ChartColumn, Check, Columns3, MessageSquare, Search, ShieldCheck, Sparkles, Zap, type LucideIcon } from "lucide-react";
import { useResolvedTheme } from "../../../shared/theme";
import { cn } from "../../../shared/ui";
import { shotSrc, type ShotView } from "./landing-shots";
import { SectionHeading } from "./SectionHeading";

/**
 * Only things the app really does today (each one is built and tested); no promises about what is coming. Three of them are shown with the
 * real screen they live on (ADR 0067); the other five are small tiles. Together they are the eight features the page has always listed.
 */
const SHOWCASE: { title: string; text: string; Icon: LucideIcon; view: ShotView; alt: string; points: string[] }[] = [
  {
    title: "Boards and sprints",
    text: "Drag work between columns, plan sprints from the backlog, and see what is in progress at a glance.",
    Icon: Columns3,
    view: "board",
    alt: "Screenshot of the board: issues in Todo, In progress and Done columns, with labels, priorities and assignees.",
    points: ["Drag cards between columns", "Plan sprints from the backlog", "Complete a sprint and see its velocity"],
  },
  {
    title: "Find anything",
    text: "Search across your issues, jump anywhere with Ctrl+K, and filter by status, priority, label, assignee or due date.",
    Icon: Search,
    view: "issues",
    alt: "Screenshot of the issue list: one row per issue with its status, priority and due date.",
    points: ["Search, and Ctrl+K from any page", "Filter by status, priority, label, assignee or due date", "Sort by priority"],
  },
  {
    title: "Analytics",
    text: "Throughput, cycle time and sprint velocity, worked out from each issue's real history.",
    Icon: ChartColumn,
    view: "analytics",
    alt: "Screenshot of the analytics page: weekly throughput, cycle time and sprint velocity charts.",
    points: ["Throughput, cycle time and velocity", "Built from what really happened to each issue", "Look back 4, 12, 26 or 52 weeks"],
  },
];

const TILES: { title: string; text: string; Icon: LucideIcon }[] = [
  {
    title: "Live for everyone",
    text: "Comments, moves and who is viewing an issue update without a refresh.",
    Icon: Zap,
  },
  {
    title: "Roles and history",
    text: "Owners, admins, members and viewers, invitations by email, and an audit log of who changed what.",
    Icon: ShieldCheck,
  },
  {
    title: "Notifications",
    text: "Hear about the issues you are part of: comments, status changes and assignments reach you as they happen.",
    Icon: Bell,
  },
  {
    title: "Comments and files",
    text: "Comment with @mentions, attach images and videos and open them in a preview, edit or delete what you wrote.",
    Icon: MessageSquare,
  },
  {
    title: "Made for your day",
    text: "A My work page with your open issues, keyboard shortcuts, and light and dark themes that follow your system.",
    Icon: Sparkles,
  },
];

export function FeatureTiles() {
  const theme = useResolvedTheme();
  return (
    <section aria-labelledby="landing-features" className="mx-auto mt-20 w-full max-w-6xl px-4 sm:mt-28 sm:px-6">
      <SectionHeading id="landing-features" title="What you get">
        Everything below is in the app today.
      </SectionHeading>
      <ul className="mt-12 flex flex-col gap-12 sm:gap-16">
        {SHOWCASE.map(({ title, text, Icon, view, alt, points }, index) => {
          const flip = index % 2 === 1;
          return (
            <li key={title} className={cn("grid items-center gap-6 lg:gap-10", flip ? "lg:grid-cols-[1.35fr_1fr]" : "lg:grid-cols-[1fr_1.35fr]")}>
              <div className={cn(flip && "lg:order-2")}>
                <Icon size={28} aria-hidden="true" className="text-[var(--color-text-link)]" />
                <h3 className="font-display mt-3 text-3xl leading-tight font-normal">{title}</h3>
                <p className="mt-3 text-lg text-[var(--color-text-muted)]">{text}</p>
                <div className="mt-4 flex flex-col gap-2">
                  {points.map((point) => (
                    <p key={point} className="flex items-center gap-2.5">
                      <Check size={18} aria-hidden="true" className="shrink-0 text-[var(--color-text-link)]" />
                      {point}
                    </p>
                  ))}
                </div>
              </div>
              <div
                className={cn(
                  "overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] shadow-xl",
                  flip && "lg:order-1",
                )}
              >
                <img src={shotSrc(view, theme)} width={1440} height={900} alt={alt} loading="lazy" className="block aspect-[16/10] w-full object-cover object-top" />
              </div>
            </li>
          );
        })}
      </ul>
      <ul className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {TILES.map(({ title, text, Icon }) => (
          <li key={title} className="glass-card rounded-[var(--radius-card)] p-5">
            <Icon size={24} aria-hidden="true" className="text-[var(--color-text-link)]" />
            <h3 className="mt-3 font-semibold">{title}</h3>
            <p className="mt-1.5 text-sm text-[var(--color-text-muted)]">{text}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
