import { useBreakdown } from "../../entities/analytics";
import { useLabels } from "../../entities/label";
import { ChartCard, EmptyState, ErrorText, Skeleton, STATUS_LABELS } from "../../shared/ui";

/**
 * Where the work is right now (ADR 0012: the present comes from the tables, not from events), as two cards: the status split of every issue, and the
 * open issues by label (ADR 0064). Both are lists of plain rows with their numbers printed, so neither needs a "view as table": the rows are the table.
 */

// Done first, then in progress, then to do: a bar that fills up as work finishes. The colors are the status tokens, which dark mode redefines.
const STATUS_ORDER = [
  { status: "done", token: "var(--color-status-done)" },
  { status: "in_progress", token: "var(--color-status-in-progress)" },
  { status: "todo", token: "var(--color-status-todo)" },
] as const;

/** One bar split by status. A status with no issues takes no room (and no legend row is hidden: all three are listed). */
export function StatusBreakdown({ organizationId, projectId }: { organizationId: string; projectId: string }) {
  const { data, isPending, isError, error } = useBreakdown(organizationId, projectId);
  const title = "Where the work is";

  if (isPending) {
    return (
      <ChartCard title={title} subtitle="Every issue, right now">
        <Skeleton className="h-48 w-full" />
      </ChartCard>
    );
  }
  if (isError) {
    return (
      <ChartCard title={title} subtitle="Every issue, right now">
        <ErrorText>Failed to load the breakdown: {error.message}</ErrorText>
      </ChartCard>
    );
  }
  if (data.total === 0) {
    return (
      <ChartCard title={title} subtitle="Every issue, right now">
        <EmptyState>No issues in this project yet.</EmptyState>
      </ChartCard>
    );
  }

  const countOf = (status: string) => data.byStatus.find((row) => row.status === status)?.count ?? 0;
  const rows = STATUS_ORDER.map((entry) => ({ ...entry, count: countOf(entry.status) }));
  const openShare = Math.round((data.openTotal / data.total) * 100);

  return (
    <ChartCard title={title} subtitle={`All ${data.total} issues, right now`}>
      <div aria-hidden="true" className="mt-6 flex h-4 gap-0.5">
        {rows
          .filter((row) => row.count > 0)
          .map((row) => (
            <div key={row.status} style={{ flexGrow: row.count, backgroundColor: row.token }} className="min-w-1 rounded-full" />
          ))}
      </div>
      <ul className="mt-4 flex flex-col gap-2.5 text-sm">
        {rows.map((row) => (
          <li key={row.status} className="flex items-center gap-2.5">
            <i aria-hidden="true" className="h-2.5 w-2.5 rounded-xs" style={{ backgroundColor: row.token }} />
            {STATUS_LABELS[row.status]}
            <span className="ml-auto text-[var(--color-text-muted)]">
              <b className="mr-1 font-semibold text-[var(--color-text-default)]">{row.count}</b>
              {Math.round((row.count / data.total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-5 text-xs text-[var(--color-text-muted)]">
        Open work is {data.openTotal} of {data.total} issues: {openShare}% of the project.
      </p>
    </ChartCard>
  );
}

/**
 * Open issues by label, as a list: the label's own color as a dot and as the bar (the owner's choice, ADR 0064; ADR 0012 had kept user-chosen colors out
 * of the charts because they ignore the semantic palette and dark mode), its name and the count. Color never carries the label alone: the name and the
 * number are printed. A label without a known color falls back to the chart color. Two gaps are shown rather than hidden: open issues with no label,
 * and labels past the top 10. The copy says outright that label counts are not additive.
 */
export function LabelBreakdown({ organizationId, projectId }: { organizationId: string; projectId: string }) {
  const { data, isPending, isError, error } = useBreakdown(organizationId, projectId);
  const labels = useLabels(organizationId);
  const title = "Open issues by label";
  const subtitle = "An issue with two labels counts under both";

  if (isPending) {
    return (
      <ChartCard title={title} subtitle={subtitle}>
        <Skeleton className="h-48 w-full" />
      </ChartCard>
    );
  }
  if (isError) {
    return (
      <ChartCard title={title} subtitle={subtitle}>
        <ErrorText>Failed to load the breakdown: {error.message}</ErrorText>
      </ChartCard>
    );
  }

  const colorOf = (labelId: string) => labels.data?.find((label) => label.id === labelId)?.color;
  const max = Math.max(1, ...data.byLabel.map((row) => row.count));

  return (
    <ChartCard title={title} subtitle={subtitle}>
      {data.byLabel.length === 0 ? (
        <EmptyState>No open issue carries a label.</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.byLabel.map((row) => (
            <li key={row.labelId} className="flex items-center gap-2 text-sm">
              <i
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: colorOf(row.labelId) ?? "var(--color-chart-quiet)" }}
              />
              <span className="w-32 shrink-0 truncate" title={row.name}>
                {row.name}
              </span>
              <span aria-hidden="true" className="h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--color-chart-quiet)]/35">
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${Math.max((row.count / max) * 100, 4)}%`, backgroundColor: colorOf(row.labelId) ?? "var(--color-chart-primary)" }}
                />
              </span>
              <b className="w-5 shrink-0 text-right font-semibold">{row.count}</b>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-col gap-0.5 text-xs text-[var(--color-text-muted)]">
        <p>These can add up to more than {data.openTotal}, the number of open issues.</p>
        {data.unlabeled > 0 && <p>{data.unlabeled} open issues have no label.</p>}
        {data.hiddenLabels > 0 && <p>{data.hiddenLabels} more labels not shown.</p>}
      </div>
    </ChartCard>
  );
}
