import { useMemo, useState, type ReactNode } from "react";
import { ArrowUpRight, X } from "lucide-react";
import { Link } from "react-router";
import type { Attachment, IssueEvent } from "@flowdesk/contracts";
import { useProjects } from "../../entities/project";
import { LabelBadge } from "../../entities/label";
import { PersonName, useMemberNames, useMyRole } from "../../entities/member";
import {
  AttachmentList,
  useAttachments,
  useIssue,
  useIssueEvents,
  useIssueLabels,
  useLiveIssueDetailUpdates,
} from "../../entities/issue";
import { DeleteIssueButton } from "../../features/delete-issue";
import { EditIssueDialog } from "../../features/edit-issue";
import { CommentCard, CommentForm } from "../../features/post-comment";
import { UploadAttachmentForm } from "../../features/upload-attachment";
import { ActivityLine } from "../activity-line";
import { useAuth } from "../../shared/auth/useAuth";
import { issuePath, projectPath } from "../../shared/lib/paths";
import {
  Button,
  buttonVariants,
  Card,
  DueDate,
  IconButton,
  Page,
  PageHeader,
  PriorityBadge,
  ScrollPanel,
  ShowMore,
  Skeleton,
  StatusBadge,
  Time,
  useAnimatedList,
  useRowMotionProps,
  type RowState,
} from "../../shared/ui";

export function IssueDetailSkeleton() {
  return (
    <>
      <Skeleton className="h-4 w-32" />
      <div className="mt-2 mb-4">
        <Skeleton className="mb-2 h-3 w-16" />
        <Skeleton className="mb-2 h-7 w-64" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="mt-6 mb-2 h-5 w-20" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </>
  );
}

/**
 * The top of the side panel: the issue key on the left, "Open full page" and close on the
 * right, on a tinted strip like a comment card's header (the owner's design pass). It stays
 * put while the content below scrolls.
 */
function PanelStrip({
  keyLabel,
  fullPageHref,
  onClose,
}: {
  keyLabel?: string;
  fullPageHref: string;
  onClose?: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border-default)] bg-[var(--color-border-default)]/40 px-4 py-2">
      <span className="text-xs text-[var(--color-text-muted)]">{keyLabel}</span>
      <span className="ml-auto" />
      <Link
        to={fullPageHref}
        className={buttonVariants({ variant: "secondary", size: "sm" })}
      >
        <span className="inline-flex items-center gap-1">
          Open full page <ArrowUpRight size={14} aria-hidden="true" />
        </span>
      </Link>
      {onClose && (
        <IconButton label="Close panel" onClick={onClose}>
          <X size={16} aria-hidden="true" />
        </IconButton>
      )}
    </div>
  );
}

/**
 * What surrounds an issue: in the side panel, the strip (key, "Open full page", close) over a scrolling
 * body; on the full page, the page frame. Exported so the address resolver (IssueByKey) can show the same
 * frame while it looks the issue up and when there is no such issue.
 */
export function IssueFrame({
  variant,
  keyLabel,
  fullPageHref,
  onClose,
  children,
}: {
  variant: "page" | "panel";
  keyLabel?: string;
  fullPageHref: string;
  onClose?: () => void;
  children: ReactNode;
}) {
  return variant === "panel" ? (
    <>
      <PanelStrip keyLabel={keyLabel} fullPageHref={fullPageHref} onClose={onClose} />
      {/* The page background, not the panel surface: the cards inside (attachments, comments)
          are surface-coloured, and on the same colour they only showed up in light mode, thanks
          to their shadow. This is also how the full page is built. */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--color-bg-page)] p-4">{children}</div>
    </>
  ) : (
    <Page>
      <div className="mx-auto max-w-3xl">{children}</div>
    </Page>
  );
}

/** An empty value in the properties card: a muted dash for the eye, and the words for a screen reader ("No priority", "Unassigned", ...). */
function Empty({ reading }: { reading: string }) {
  return (
    <span className="text-[var(--color-text-muted)]">
      <span aria-hidden="true">&ndash;</span>
      <span className="sr-only">{reading}</span>
    </span>
  );
}

/** One labelled value of the full page's properties card. */
function Property({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="mb-1 text-xs text-[var(--color-text-muted)]">{label}</dt>
      <dd className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">{children}</dd>
    </div>
  );
}

function TimelineSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-4 w-56" />
      <Skeleton className="h-4 w-40" />
    </div>
  );
}

/** "Alice is also viewing" / "Alice and Bob are also viewing" / "Alice,
 * Bob, and Carol are also viewing" — plain English list join, with each name
 * the hoverable person name. Not worth a shared/ui component for the one place
 * this is used. */
function Viewers({
  viewers,
  organizationId,
}: {
  viewers: { userId: string; name: string }[];
  organizationId: string;
}) {
  const people = viewers.map((viewer) => (
    <PersonName
      key={viewer.userId}
      organizationId={organizationId}
      userId={viewer.userId}
      name={viewer.name}
    />
  ));
  const last = people.length - 1;
  return (
    <>
      {people.map((person, i) => (
        <span key={viewers[i]!.userId}>
          {i > 0 && (i === last ? (last === 1 ? " and " : ", and ") : ", ")}
          {person}
        </span>
      ))}
      {people.length === 1 ? " is also viewing" : " are also viewing"}
    </>
  );
}

function TimelineScroll({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  return enabled ? (
    <ScrollPanel label="Activity timeline" look="edges" fitWindow className="max-h-[32rem]">
      {children}
    </ScrollPanel>
  ) : (
    <>{children}</>
  );
}

function TimelineEntry({
  event,
  files,
  organizationId,
  projectId,
  issueId,
  rowState,
  rowIndex,
}: {
  event: IssueEvent;
  rowState: RowState;
  rowIndex: number;
  files: Attachment[];
  organizationId: string;
  projectId: string;
  issueId: string;
}) {
  const { ref: rowRef, className: rowClass, style: rowStyle } = useRowMotionProps<HTMLLIElement>(rowState, rowIndex);
  if (event.type === "issue.commented") {
    return (
      <li ref={rowRef} style={rowStyle} className={rowClass}>
        <CommentCard
          event={event}
          files={files}
          organizationId={organizationId}
          projectId={projectId}
          issueId={issueId}
        />
      </li>
    );
  }

  return <ActivityLine event={event} organizationId={organizationId} rowState={rowState} rowIndex={rowIndex} />;
}

/**
 * The whole issue: header, description, attachments, activity and the comment box. Used by
 * the full issue page today and by the side panel (next step), so the two can never drift.
 *
 * `variant` "page" (default) is the full page: the page frame, a serif title and a back link.
 * "panel" is the side-panel version: a tinted strip with the key, "Open full page" and
 * close, then the same content scrolling underneath. Everything below the header is shared.
 *
 * `onGone` is called when the issue no longer exists for this person: they deleted it, or
 * someone else did (the live update). The caller decides where to send them.
 */
export function IssueDetail({
  projectId,
  issueId,
  variant = "page",
  onClose,
  onGone,
}: {
  projectId: string;
  issueId: string;
  variant?: "page" | "panel";
  /** The panel's close button; unused by the page. */
  onClose?: () => void;
  onGone: () => void;
}) {
  const { organization, user } = useAuth();
  const { data: projects, isPending: projectsPending } = useProjects(organization!.id);
  const project = projects?.find((p) => p.id === projectId);
  const nameOf = useMemberNames(organization!.id);
  const role = useMyRole(organization!.id);

  const { data: issue, isPending: issuePending } = useIssue(
    organization!.id,
    projectId,
    issueId,
  );

  const { data: events, isPending: eventsPending } = useIssueEvents(
    organization!.id,
    projectId,
    issueId,
  );
  const { data: attachments } = useAttachments(organization!.id, projectId, issueId);
  // The same query the editor's label picker uses, so a label added there shows here at once.
  const { data: issueLabels } = useIssueLabels(organization!.id, projectId, issueId);
  // Timeline entries that arrive later (a comment, a status change, from anyone) open up with a flash.
  // The API sends oldest first (analytics and history depend on it); the screen shows newest first.
  const newestFirst = useMemo(() => [...(events ?? [])].reverse(), [events]);
  const eventRows = useAnimatedList(newestFirst, (event) => event.id, { ready: !eventsPending });
  const { viewers } = useLiveIssueDetailUpdates(projectId, issueId, onGone);
  const otherViewers = viewers.filter((viewer) => viewer.userId !== user?.id);

  const [isEditing, setIsEditing] = useState(false);
  const [showConflictNotice, setShowConflictNotice] = useState(false);

  const panel = variant === "panel";
  // "Open full page" goes to the readable address once the issue is known (its number is part of it).
  const fullPageHref = project ? (issue ? issuePath(project.key, issue.number) : projectPath(project.key)) : "/projects";
  const frame = (children: ReactNode, keyLabel?: string) => (
    <IssueFrame variant={variant} keyLabel={keyLabel} fullPageHref={fullPageHref} onClose={onClose}>
      {children}
    </IssueFrame>
  );
  // Sections sit one level under the title: h2 on the page (h1 title), h3 in the panel (h2 title).
  const Heading = panel ? "h3" : "h2";

  if (projectsPending || issuePending) {
    return frame(<IssueDetailSkeleton />);
  }

  if (!project || !issue) {
    return frame(<p className="text-[var(--color-text-danger)]">Issue not found.</p>);
  }

  const header = (title: string, children?: ReactNode, aside?: ReactNode) =>
    panel ? (
      <header className="mb-4">
        <h2 className="font-display text-xl leading-tight">{title}</h2>
        {children && <div className="mt-2">{children}</div>}
      </header>
    ) : (
      <PageHeader
        // history: Back returns to wherever the issue was opened from (My work, the board, a notification); the project is the
        // fallback for a first page or a new tab.
        back={{ to: projectPath(project.key), label: project.name, history: true }}
        eyebrow={`${project.key}-${issue.number}`}
        title={title}
        aside={aside}
      >
        {children}
      </PageHeader>
    );

  return frame(
    <>
      {isEditing && (
        <EditIssueDialog
          issue={issue}
          issueKey={`${project.key}-${issue.number}`}
          organizationId={organization!.id}
          projectId={project.id}
          onClose={() => setIsEditing(false)}
          onConflict={() => setShowConflictNotice(true)}
        />
      )}
      {panel ? (
        header(
          issue.title,
          <>
            <div className="flex items-center gap-3">
              <StatusBadge status={issue.status} />
              <PriorityBadge priority={issue.priority} />
              <DueDate dueDate={issue.dueDate} done={issue.status === "done"} />
              {nameOf(issue.assigneeId) && (
                <span className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
                  <PersonName
                    organizationId={organization!.id}
                    userId={issue.assigneeId!}
                    name={nameOf(issue.assigneeId)!}
                    withAvatar
                  />
                </span>
              )}
              <Button
                type="button"
                variant="link"
                onClick={() => {
                  setShowConflictNotice(false);
                  setIsEditing(true);
                }}
              >
                Edit
              </Button>
            </div>
            {issueLabels && issueLabels.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1" aria-label="Labels" role="group">
                {issueLabels.map((label) => (
                  <LabelBadge key={label.id} label={label} />
                ))}
              </div>
            )}
            {otherViewers.length > 0 && (
              <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                <Viewers viewers={otherViewers} organizationId={organization!.id} />
              </p>
            )}
          </>,
        )
      ) : (
        header(
          issue.title,
          otherViewers.length > 0 ? (
            <p className="text-xs text-[var(--color-text-muted)]">
              <Viewers viewers={otherViewers} organizationId={organization!.id} />
            </p>
          ) : undefined,
          <Button
            type="button"
            variant="secondary"
            size="sm"
            // Room under the button: in the page header's right side it would otherwise sit on the header's line.
            className="mb-2"
            onClick={() => {
              setShowConflictNotice(false);
              setIsEditing(true);
            }}
          >
            Edit
          </Button>,
        )
      )}
      {!panel && (
        <Card className="mb-6 p-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            <Property label="Status">
              <StatusBadge status={issue.status} />
            </Property>
            <Property label="Priority">
              {issue.priority === "none" ? <Empty reading="No priority" /> : <PriorityBadge priority={issue.priority} />}
            </Property>
            <Property label="Assignee">
              {nameOf(issue.assigneeId) ? (
                <PersonName organizationId={organization!.id} userId={issue.assigneeId!} name={nameOf(issue.assigneeId)!} withAvatar />
              ) : (
                <Empty reading="Unassigned" />
              )}
            </Property>
            <Property label="Due">
              {issue.dueDate ? <DueDate dueDate={issue.dueDate} done={issue.status === "done"} /> : <Empty reading="No due date" />}
            </Property>
            <Property label="Labels">
              {issueLabels && issueLabels.length > 0 ? (
                <div className="flex flex-wrap gap-1" aria-label="Labels" role="group">
                  {issueLabels.map((label) => (
                    <LabelBadge key={label.id} label={label} />
                  ))}
                </div>
              ) : (
                <Empty reading="No labels" />
              )}
            </Property>
            <Property label="Reporter">
              {nameOf(issue.reporterId) ? (
                <PersonName organizationId={organization!.id} userId={issue.reporterId} name={nameOf(issue.reporterId)!} withAvatar />
              ) : (
                <span className="text-[var(--color-text-muted)]">Not in the organization</span>
              )}
            </Property>
            <Property label="Created">
              <Time iso={issue.createdAt} />
            </Property>
            <Property label="Updated">
              <Time iso={issue.updatedAt} />
            </Property>
          </dl>
        </Card>
      )}
      {showConflictNotice && (
        <p className="mb-4 text-sm text-[var(--color-text-warning)]">
          This issue was updated by someone else — showing the latest version.
        </p>
      )}
      {panel ? (
        issue.description && <p className="mb-4 whitespace-pre-wrap [overflow-wrap:anywhere]">{issue.description}</p>
      ) : (
        <Card className="mb-2 p-4">
          <h2 className="mb-2 text-sm font-semibold">Description</h2>
          {issue.description ? (
            // A very long description is folded (about 15rem) with Show more / Show less, instead of pushing everything below it out of sight.
            <ShowMore>
              <p className="text-sm leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere]">{issue.description}</p>
            </ShowMore>
          ) : (
            <p className="text-sm text-[var(--color-text-muted)]">No description.</p>
          )}
        </Card>
      )}

      <Heading className={panel ? "mt-6 mb-2 text-lg font-semibold" : "mt-6 mb-2 text-sm font-semibold"}>Attachments</Heading>
      <AttachmentList
        organizationId={organization!.id}
        projectId={project.id}
        issueId={issue.id}
        renderPerson={(person) => (
          <PersonName
            organizationId={organization!.id}
            userId={person.userId}
            name={person.name}
            align="right"
          />
        )}
      />
      <div className="mt-2">
        <UploadAttachmentForm
          organizationId={organization!.id}
          projectId={project.id}
          issueId={issue.id}
        />
      </div>

      <Heading className={panel ? "mt-6 mb-2 text-lg font-semibold" : "mt-6 mb-2 text-sm font-semibold"}>Activity</Heading>
      <div className="mb-4">
        <CommentForm
          organizationId={organization!.id}
          projectId={project.id}
          issueId={issue.id}
        />
      </div>
      {eventsPending ? (
        <TimelineSkeleton />
      ) : (
        // On the full page a long timeline scrolls inside its own area (about 32rem) with the comment box fixed
        // above it. The side panel already scrolls as a whole, so a second scroll inside it is left out.
        <TimelineScroll enabled={!panel}>
          <ul className="flex flex-col gap-3">
            {eventRows.map(({ key, item: event, state, index }) => (
              <TimelineEntry
                key={key}
                rowState={state}
                rowIndex={index}
                event={event}
                files={(attachments ?? []).filter(
                  (a) => a.commentId === event.payload.commentId,
                )}
                organizationId={organization!.id}
                projectId={project.id}
                issueId={issue.id}
              />
            ))}
          </ul>
        </TimelineScroll>
      )}

      {/* The reporter, or an owner or admin (the API enforces the same rule). */}
      {(issue.reporterId === user?.id || role === "owner" || role === "admin") && (
        <section className="mt-10 border-t border-[var(--color-border-default)] pt-4">
          <h2 className="mb-2 text-sm font-semibold">Danger zone</h2>
          <DeleteIssueButton
            organizationId={organization!.id}
            projectId={project.id}
            issueId={issue.id}
            onDeleted={onGone}
          />
        </section>
      )}
    </>,
    `${project.key}-${issue.number}`,
  );
}
