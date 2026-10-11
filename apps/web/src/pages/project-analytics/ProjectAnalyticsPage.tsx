import { useSearchParams } from "react-router";
import { useVelocity } from "../../entities/analytics";
import { useCurrentProject } from "../../entities/project";
import { useAuth } from "../../shared/auth/useAuth";
import { Dropdown, Page, PageHeader, SegmentedControl } from "../../shared/ui";
import { AnalyticsSummary } from "../../widgets/analytics-summary";
import { LabelBreakdown, StatusBreakdown } from "../../widgets/breakdown-charts";
import { CycleTimeChart } from "../../widgets/cycle-time-chart";
import { ThroughputChart } from "../../widgets/throughput-chart";
import { VelocityChart } from "../../widgets/velocity-chart";

// The range lives in the URL (?weeks=, ?sprints=), same convention as the
// issue list's ?status=/?order=: a bookmarked or shared link reproduces the
// same dashboard. Only these values are offered; anything else in the URL
// (a hand-edited ?weeks=999, ?weeks=abc) falls back to the default instead of
// breaking the page. The API validates its own bounds independently.
const WEEKS_CHOICES = [4, 12, 26, 52] as const;
const DEFAULT_WEEKS = 12;
const SPRINT_CHOICES = [4, 8, 12] as const;
const DEFAULT_SPRINTS = 8;

// Offering "Last 12 sprints" when only 6 exist looks broken: it changes
// nothing. A choice is shown only while the next smaller one hasn't already
// covered every completed sprint, so with 6 sprints the list is 4 and 8.
function visibleSprintChoices(completedSprints: number | undefined): readonly number[] {
  if (completedSprints === undefined) return SPRINT_CHOICES;
  return SPRINT_CHOICES.filter((_, i) => i === 0 || SPRINT_CHOICES[i - 1]! < completedSprints);
}

function parseChoice(raw: string | null, allowed: readonly number[], fallback: number): number {
  const value = Number(raw);
  return allowed.includes(value) ? value : fallback;
}

/**
 * The project's analytics (ADR 0064): four headline numbers, then the charts. The period is a short row of choices in the header (it was a dropdown),
 * the velocity range stays a dropdown because its choices depend on how many sprints exist. Throughput and the status split share the first row,
 * cycle time, velocity and labels the second; on a narrow window everything stacks.
 */
export function ProjectAnalyticsPage() {
  const { organization } = useAuth();
  const project = useCurrentProject();
  const projectId = project.id;
  const organizationId = organization!.id;
  const [searchParams, setSearchParams] = useSearchParams();

  const weeks = parseChoice(searchParams.get("weeks"), WEEKS_CHOICES, DEFAULT_WEEKS);
  const requestedSprints = parseChoice(searchParams.get("sprints"), SPRINT_CHOICES, DEFAULT_SPRINTS);

  // Asks for the largest window once just to learn how many completed sprints
  // exist; the velocity widget then fetches its own (smaller) window.
  const { data: allVelocity } = useVelocity(organizationId, projectId, SPRINT_CHOICES[SPRINT_CHOICES.length - 1]!);
  const sprintChoices = visibleSprintChoices(allVelocity?.data.length);
  // A hand-edited or stale ?sprints= that is no longer offered snaps to the
  // nearest offered choice that still covers it.
  const sprints = sprintChoices.find((c) => c >= requestedSprints) ?? sprintChoices[sprintChoices.length - 1]!;

  // Choosing the default removes the param, so the plain URL stays clean.
  function setRange(name: "weeks" | "sprints", value: number, defaultValue: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === defaultValue) {
        next.delete(name);
      } else {
        next.set(name, String(value));
      }
      return next;
    });
  }

  const controls = (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-2 text-sm">
      <SegmentedControl
        label="Period for throughput and cycle time"
        value={String(weeks)}
        onChange={(value) => setRange("weeks", Number(value), DEFAULT_WEEKS)}
        options={WEEKS_CHOICES.map((choice) => ({ value: String(choice), label: `${choice} weeks` }))}
      />
      {sprintChoices.length > 1 && (
        <label className="flex items-center gap-2">
          <span className="text-[var(--color-text-muted)]">Velocity</span>
          <Dropdown
            aria-label="Number of sprints for velocity"
            className="w-auto"
            value={String(sprints)}
            onChange={(value) => setRange("sprints", Number(value), DEFAULT_SPRINTS)}
            options={sprintChoices.map((choice) => ({ value: String(choice), label: `Last ${choice} sprints` }))}
          />
        </label>
      )}
    </div>
  );

  return (
    <Page width="wide">
      <PageHeader eyebrow={project.name} title="Analytics" aside={controls} />

      <div className="mt-4 flex flex-col gap-4">
        <AnalyticsSummary organizationId={organizationId} projectId={projectId} weeks={weeks} sprints={sprints} />

        <div className="grid gap-4 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <ThroughputChart organizationId={organizationId} projectId={projectId} weeks={weeks} />
          </div>
          <div className="lg:col-span-4">
            <StatusBreakdown organizationId={organizationId} projectId={projectId} />
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <CycleTimeChart organizationId={organizationId} projectId={projectId} weeks={weeks} />
          <VelocityChart organizationId={organizationId} projectId={projectId} sprints={sprints} />
          <LabelBreakdown organizationId={organizationId} projectId={projectId} />
        </div>
      </div>
    </Page>
  );
}
