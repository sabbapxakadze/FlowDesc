# 0012 — Breakdowns read current state from the tables

Status: Accepted (Phase 8, slice 4)

## Context

ADR 0009 made analytics event-derived because throughput, cycle time and
velocity are questions about *history*: no table stores when an issue
finished. The breakdowns ask a different question: where the work is *right
now* (issues per status, open issues per label). The answer is already
stored, in `issues.status` and `issue_labels`.

## Decision

1. **Breakdowns read the `issues` and `issue_labels` tables directly.** The
   rule is: history comes from `issue_events`, the present comes from the
   tables. Replaying the event log to rediscover today's status would be
   slower, harder to read, and a second way to be wrong about something the
   database already says exactly.
2. **By status:** every issue in the project, always the three statuses in
   workflow order (`todo`, `in_progress`, `done`), zero-filled.
3. **By label: open issues only (status is not `done`).** The useful
   question is what the backlog is made of; finished work would bury it. An
   issue with several labels is counted once under each, so label counts can
   add up to more than the number of open issues. The UI says so.
4. **Two gaps are reported, not hidden:** `unlabeled` (open issues with no
   label) and `hiddenLabels` (labels beyond the top 10 by open-issue count,
   ties by name).
5. **One endpoint** returns both breakdowns, because they are one card and
   always shown together. Same `analytics` module and `view_issue`
   permission as the other metrics.
6. **Tenant scoping is on both tables.** Labels are organization-level, so
   the query filters the label's organization as well as the issue's, rather
   than relying on the join alone.

## Consequences

- Cheap: a couple of grouped queries over one project's issues; no replay.
- The numbers are as of the request. They will differ from anything
  derived from events "as of a past date" (which this slice does not offer).
- The label counts are not additive; a reader who sums them will overcount,
  which is why the copy calls it out.
- A very long tail of labels is cut at 10 and acknowledged, not paged.

> **Amended by ADR 0064 (2026-10-12):** the label list now shows the label's own color as the dot and the bar (a few label colors are slightly under 3:1 on the dark card; the name and count are always printed), and the status colors are used for a segmented bar; their contrast was measured and is at or above 3:1.

## Alternatives rejected

- **Derive current status from events:** correct only if the replay is
  correct, and pointless when the column holds the answer.
- **Stacked bars (label by status):** a second dimension that needs a
  legend and a validated multi-color palette; deferred until it is asked for.
- **Show label colors in the chart:** user-chosen colors bypass the semantic
  palette and dark mode (the reason `LabelBadge` is the one raw-color
  exception in the design system).
