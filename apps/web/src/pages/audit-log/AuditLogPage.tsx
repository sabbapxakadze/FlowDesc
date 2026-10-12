import { useSearchParams } from "react-router";
import {
  FolderKanban,
  Milestone,
  Tag,
  CircleDot,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { AuditEvent, AuditTargetType } from "@flowdesc/contracts";
import { auditTone, describeAuditEvent, useAuditEvents, type AuditFilters } from "../../entities/audit";
import { memberOptions, PersonName, useMembers, useMyRole } from "../../entities/member";
import { ExportAuditLogButton } from "../../features/export-audit-log";
import { useAuth } from "../../shared/auth/useAuth";
import { Button, Card, Dropdown, EmptyState, ErrorText, Page, PageHeader, ScrollPanel, Skeleton, Time } from "../../shared/ui";

const KINDS: { value: AuditTargetType; label: string }[] = [
  { value: "project", label: "Projects" },
  { value: "label", label: "Labels" },
  { value: "sprint", label: "Sprints" },
  { value: "issue", label: "Issues" },
  { value: "member", label: "Members" },
];
const KIND_VALUES = KINDS.map((k) => k.value);

const ICONS: Record<AuditTargetType, LucideIcon> = {
  project: FolderKanban,
  label: Tag,
  sprint: Milestone,
  issue: CircleDot,
  member: Users,
};
// Same colours as the issue activity lines (the event tokens).
const TONE: Record<"added" | "removed" | "changed", string> = {
  added: "text-[var(--color-event-added)]",
  removed: "text-[var(--color-event-removed)]",
  changed: "text-[var(--color-event-changed)]",
};

function AuditRow({ event, organizationId, index }: { event: AuditEvent; organizationId: string; index: number }) {
  const Icon = ICONS[event.targetType];
  return (
    <Card as="li" rowState="initial" rowIndex={index} className="flex items-center gap-3">
      <span
        className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-border-default)] ${TONE[auditTone(event)]}`}
      >
        <Icon size={14} aria-hidden="true" />
      </span>
      <p className="min-w-0 flex-1 text-sm text-[var(--color-text-muted)]">
        {event.actorId ? (
          <PersonName organizationId={organizationId} userId={event.actorId} name={event.actorName} />
        ) : (
          <span className="font-medium text-[var(--color-text-default)]">{event.actorName}</span>
        )}{" "}
        {describeAuditEvent(event)}
      </p>
      <Time iso={event.createdAt} className="shrink-0 whitespace-nowrap text-xs text-[var(--color-text-muted)]" />
    </Card>
  );
}

/**
 * The organization audit log (ADR 0027): who did what, newest first, for owners and admins only.
 * Filters live in the URL like the issue list's. A member who opens the address anyway is told
 * why there is nothing to see; the API refuses them too.
 */
export function AuditLogPage() {
  const { organization } = useAuth();
  const organizationId = organization!.id;
  const role = useMyRole(organizationId);
  const canView = role === "owner" || role === "admin";
  const { data: members } = useMembers(organizationId);

  const [searchParams, setSearchParams] = useSearchParams();
  const actorParam = searchParams.get("actor");
  const kindParam = searchParams.get("kind");
  const filters: AuditFilters = {
    actor: actorParam || undefined,
    kind: KIND_VALUES.includes(kindParam as AuditTargetType) ? (kindParam as AuditTargetType) : undefined,
  };

  const { data, isPending, isError, error, hasNextPage, isFetchingNextPage, fetchNextPage } = useAuditEvents(
    organizationId,
    filters,
    { enabled: canView },
  );
  const events = data?.pages.flatMap((page) => page.data) ?? [];

  function setFilter(name: "actor" | "kind", value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value === "") next.delete(name);
      else next.set(name, value);
      return next;
    });
  }

  if (role && !canView) {
    return (
      <Page>
        <PageHeader title="Audit log" />
        <p className="text-sm text-[var(--color-text-muted)]">Only owners and admins can see the audit log.</p>
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader title="Audit log" />
      <p className="mb-4 text-sm text-[var(--color-text-muted)]">
        Who changed what in {organization!.name}, newest first. Deleted things stay listed by the name they had.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Dropdown
          aria-label="Filter by person"
          className="w-auto"
          value={filters.actor ?? ""}
          onChange={(value) => setFilter("actor", value)}
          options={[{ value: "", label: "Anyone" }, ...memberOptions(members)]}
        />
        <Dropdown
          aria-label="Filter by kind"
          className="w-auto"
          value={filters.kind ?? ""}
          onChange={(value) => setFilter("kind", value)}
          options={[{ value: "", label: "Everything" }, ...KINDS.map((kind) => ({ value: kind.value, label: kind.label }))]}
        />
        {canView && <ExportAuditLogButton organizationId={organizationId} filters={filters} />}
      </div>

      {!canView || isPending ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : isError ? (
        <ErrorText>Failed to load the audit log: {error.message}</ErrorText>
      ) : events.length === 0 ? (
        <EmptyState block>{filters.actor || filters.kind ? "Nothing matches these filters." : "Nothing has been recorded yet."}</EmptyState>
      ) : (
        // "Load more" adds rows inside the panel (capped to the room left in the window), the page keeps its height.
        <ScrollPanel
          label="Audit log entries"
          fitWindow
          className="max-h-[75dvh]"
          footer={
            hasNextPage && (
              <Button type="button" variant="secondary" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
                {isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            )
          }
        >
          <ul aria-label="Audit log" className="flex flex-col gap-2">
            {events.map((event, index) => (
              <AuditRow key={event.id} event={event} organizationId={organizationId} index={index} />
            ))}
          </ul>
        </ScrollPanel>
      )}
    </Page>
  );
}
