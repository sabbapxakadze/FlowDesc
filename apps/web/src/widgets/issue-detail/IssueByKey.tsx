import { useEffect } from "react";
import type { Project } from "@flowdesc/contracts";
import { useIssue, useIssueByNumber } from "../../entities/issue";
import { ApiError } from "../../shared/api/client";
import { useAuth } from "../../shared/auth/useAuth";
import { issueKey, parseIssueRef, projectPath } from "../../shared/lib/paths";
import { ErrorText } from "../../shared/ui";
import { IssueDetail, IssueDetailSkeleton, IssueFrame } from "./IssueDetail";

/**
 * Opens the issue an address (or `?issue=`) names (ADR 0030): "WEB-12", a bare "12", or an old id. It
 * finds the issue first (by number through the API, or by id for an old link), shows the skeleton while it
 * does, says "Issue not found" when there is no such issue, and only then renders IssueDetail, which keeps
 * working on ids exactly as before. So IssueDetail never runs a hook with an unknown id.
 *
 * A key whose project part is not THIS project's key ("API-3" under /projects/WEB) is not found without
 * asking the server: numbers belong to a project, so the prefix is checked, not trusted. Once the issue is
 * known, `onCanonical` is told the readable form ("WEB-12") whenever the address said something else (an old
 * id, lowercase, a bare number), so the address can be rewritten in place.
 */
export function IssueByKey({
  project,
  issueRef,
  variant = "page",
  onClose,
  onGone,
  onCanonical,
}: {
  project: Pick<Project, "id" | "key">;
  issueRef: string;
  variant?: "page" | "panel";
  /** The panel's close button; unused by the page. */
  onClose?: () => void;
  onGone: () => void;
  onCanonical?: (canonicalRef: string) => void;
}) {
  const { organization } = useAuth();
  const organizationId = organization!.id;
  const ref = parseIssueRef(issueRef);
  const foreignPrefix =
    ref.kind === "number" && ref.prefix !== null && ref.prefix.toLowerCase() !== project.key.toLowerCase();

  const byId = useIssue(organizationId, project.id, ref.kind === "uuid" ? ref.id : "", { enabled: ref.kind === "uuid" });
  const byNumber = useIssueByNumber(organizationId, project.id, ref.kind === "number" && !foreignPrefix ? ref.number : null);
  const query = ref.kind === "uuid" ? byId : byNumber;
  const issue = query.data;

  const canonical = issue ? issueKey(project.key, issue.number) : null;
  useEffect(() => {
    if (canonical && issueRef !== canonical) onCanonical?.(canonical);
  }, [canonical, issueRef, onCanonical]);

  const frame = (children: React.ReactNode) => (
    <IssueFrame variant={variant} fullPageHref={projectPath(project.key)} onClose={onClose}>
      {children}
    </IssueFrame>
  );

  if (ref.kind === "invalid" || foreignPrefix) {
    return frame(<p className="text-[var(--color-text-danger)]">Issue not found.</p>);
  }
  if (query.isPending) return frame(<IssueDetailSkeleton />);
  if (query.isError) {
    const missing = query.error instanceof ApiError && query.error.status === 404;
    return frame(
      missing ? (
        <p className="text-[var(--color-text-danger)]">Issue not found.</p>
      ) : (
        <ErrorText>Failed to load the issue: {query.error.message}</ErrorText>
      ),
    );
  }
  if (!issue) return frame(<p className="text-[var(--color-text-danger)]">Issue not found.</p>);
  // The address is about to be rewritten to the readable form: keep the skeleton until it has been, so the
  // issue is not shown twice (the page is keyed by path, so a rewrite remounts it).
  if (canonical && issueRef !== canonical) return frame(<IssueDetailSkeleton />);

  return (
    <IssueDetail key={issue.id} variant={variant} projectId={project.id} issueId={issue.id} onClose={onClose} onGone={onGone} />
  );
}
