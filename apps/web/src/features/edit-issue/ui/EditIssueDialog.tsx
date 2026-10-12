import { useState } from "react";
import type { Issue } from "@flowdesc/contracts";
import { Dialog } from "../../../shared/ui";
import { EditIssueForm } from "./EditIssueForm";

/**
 * Editing an issue happens here, in a popup, from every place that has an Edit button (the issue list, the
 * issue page and the side panel). The popup is a native modal dialog, so with the side panel open it simply
 * appears on top of it; Esc or Cancel closes only the popup. Mount it only while editing.
 *
 * A click on the dimmed area closes it unless there is unsaved text (a stray click must not throw the edit
 * away); Esc and the X always close it.
 */
export function EditIssueDialog({
  issue,
  issueKey,
  organizationId,
  projectId,
  onClose,
  onConflict,
}: {
  issue: Issue;
  /** "WEB-12", for the title. */
  issueKey: string;
  organizationId: string;
  projectId: string;
  onClose: () => void;
  onConflict: () => void;
}) {
  const [dirty, setDirty] = useState(false);
  return (
    <Dialog title={`Edit ${issueKey}`} onClose={onClose} dismissOnBackdrop={!dirty}>
      <EditIssueForm
        issue={issue}
        organizationId={organizationId}
        projectId={projectId}
        onDone={onClose}
        onConflict={onConflict}
        onDirtyChange={setDirty}
      />
    </Dialog>
  );
}
