import { useEffect, useState } from "react";
import { withViewTransition } from "../../../shared/lib/motion";
import { useResolvedTheme } from "../../../shared/theme";
import { Button } from "../../../shared/ui";
import { shotSrc } from "./landing-shots";

/**
 * The real app, shown: screenshots of the demo organization (taken by `pnpm landing:shots`, in `public/landing/`), one per screen and
 * per theme. The frame shows the top of the screenshot and fades out at the bottom edge; the three pill buttons swap the screen with the
 * app's cross-fade. The picture follows the theme the page is showing. They are static images: they go out of date when the UI changes.
 */
const VIEWS = [
  { id: "board", label: "Board", alt: "The FlowDesc board: issues in Todo, In progress and Done columns, with labels, priorities and assignees." },
  { id: "issues", label: "Issues", alt: "The FlowDesc issue list: one row per issue with its status, priority and due date." },
  { id: "analytics", label: "Analytics", alt: "The FlowDesc analytics page: weekly throughput, cycle time and sprint velocity charts." },
] as const;
type ViewId = (typeof VIEWS)[number]["id"];

export function ProductPreview() {
  const theme = useResolvedTheme();
  const [view, setView] = useState<ViewId>("board");
  const current = VIEWS.find((v) => v.id === view)!;

  // Fetch the other screens (for the current theme) once the page is idle, so switching shows them at once instead of a blank frame.
  useEffect(() => {
    for (const v of VIEWS) new Image().src = shotSrc(v.id, theme);
  }, [theme]);

  return (
    <section aria-label="Product preview" className="mx-auto mt-12 w-full max-w-6xl px-4 sm:mt-14 sm:px-6">
      <div role="group" aria-label="Choose a screen" className="mb-4 flex justify-center gap-2.5">
        {VIEWS.map((v) => (
          <Button
            key={v.id}
            type="button"
            size="md"
            variant={v.id === view ? "create" : "secondary"}
            aria-pressed={v.id === view}
            onClick={() => withViewTransition(() => setView(v.id))}
            className={v.id === view ? "rounded-full px-5" : "rounded-full bg-[var(--color-bg-surface)] px-5"}
          >
            {v.label}
          </Button>
        ))}
      </div>
      <div className="glass-card landing-fade rounded-[var(--radius-card)] p-2.5 sm:p-3.5">
        <div className="overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-border-default)]" style={{ aspectRatio: "1440 / 740" }}>
          <img
            key={`${view}-${theme}`}
            src={shotSrc(view, theme)}
            width={1440}
            height={900}
            alt={current.alt}
            fetchPriority={view === "board" ? "high" : undefined}
            className="block w-full"
          />
        </div>
      </div>
    </section>
  );
}
