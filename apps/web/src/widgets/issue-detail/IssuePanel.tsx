import { useState } from "react";
import type { Project } from "@flowdesc/contracts";
import { SidePanel, useExitPresence } from "../../shared/ui";
import { IssueByKey } from "./IssueByKey";
import { useIssuePanel } from "./useIssuePanel";

/**
 * The side panel for the issue named by `?issue=` in the URL (a readable key such as WEB-12, or an old id),
 * or nothing when there is none. A page renders this once and passes `panel.open` to its issue cards.
 * IssueByKey finds the issue and keys the detail by its id, so an edit form left open on one issue does not
 * carry over to the next one.
 *
 * When the issue is closed the panel slides out instead of vanishing: it stays mounted for the
 * exit animation (useExitPresence) and keeps showing the issue it had, while the URL has already
 * lost `?issue=`. Opening another issue while one is open keeps the same panel (no slide again).
 */
export function IssuePanel({ project }: { project: Pick<Project, "id" | "key"> }) {
  const { issueRef, close, rewrite } = useIssuePanel();
  const { rendered, closing } = useExitPresence(Boolean(issueRef), 220);
  // The last issue that was open, so the panel has something to show while it slides away.
  const [shownRef, setShownRef] = useState(issueRef);
  if (issueRef && issueRef !== shownRef) setShownRef(issueRef);

  if (!rendered || !shownRef) return null;

  return (
    <SidePanel label="Issue" closing={closing} onClose={() => close()}>
      <IssueByKey
        project={project}
        issueRef={shownRef}
        variant="panel"
        onClose={() => close()}
        onGone={() => close("This issue was deleted.")}
        onCanonical={rewrite}
      />
    </SidePanel>
  );
}
