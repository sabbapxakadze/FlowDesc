import { ChevronRight } from "lucide-react";

/**
 * What FlowDesc is, in plain words, next to a small picture of how the pieces nest. Everything named here exists in the app: an
 * organization holds projects, a project holds issues (read as KEY-number, like WEB-25), and an issue carries the details people act on.
 */
export function About() {
  return (
    <section aria-labelledby="landing-about" className="mx-auto mt-20 w-full max-w-6xl px-4 sm:mt-28 sm:px-6">
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-14">
        <div>
          <h2 id="landing-about" className="font-display text-3xl leading-tight font-normal sm:text-4xl">
            One place for your team's work
          </h2>
          <p className="mt-4 text-base text-[var(--color-text-muted)] sm:text-lg">
            FlowDesc is a project management app. Your team works inside an organization, the organization has projects, and every project is a
            list of issues: the tasks, bugs and ideas you are working on.
          </p>
          <p className="mt-4 text-base text-[var(--color-text-muted)] sm:text-lg">
            Each issue carries what people need to act on it: a status, a priority, an assignee, a due date, labels, comments and files. Sprints
            group the work you are doing now, and analytics read the history to show how it is going.
          </p>
        </div>

        <div className="glass-card rounded-[var(--radius-card)] p-5 sm:p-7" role="img" aria-label="How FlowDesc is organized: an organization has projects, a project has issues, and an issue has a status, priority, assignee, due date, labels, comments and files.">
          <ol className="flex flex-col gap-3 text-sm sm:text-base" aria-hidden="true">
            <Level label="Organization" example="Your team" depth={0} />
            <Level label="Projects" example="WEB · APP · API" depth={1} />
            <Level label="Issue" example="WEB-25  Fix layout shift on the homepage hero image" depth={2} />
            <Level label="On every issue" example="status · priority · assignee · due date · labels · comments · files" depth={3} />
          </ol>
        </div>
      </div>
    </section>
  );
}

function Level({ label, example, depth }: { label: string; example: string; depth: number }) {
  return (
    <li className="flex items-start gap-2" style={{ paddingLeft: `${depth * 1.25}rem` }}>
      {depth > 0 && <ChevronRight size={16} className="mt-1 shrink-0 text-[var(--color-text-muted)]" />}
      <div className="rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] px-3 py-2">
        <p className="text-xs font-medium tracking-wide text-[var(--color-text-muted)] uppercase">{label}</p>
        <p className="mt-0.5 font-medium">{example}</p>
      </div>
    </li>
  );
}
