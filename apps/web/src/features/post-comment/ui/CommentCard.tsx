import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Pencil, Trash2 } from "lucide-react";
import { inlineImageIds, type Attachment, type IssueEvent } from "@flowdesk/contracts";
import { AttachmentLink, AttachmentThumbnail, InlineImage, issueKeys, previewKind } from "../../../entities/issue";
import { MentionedText, PersonName } from "../../../entities/member";
import { Button, ErrorText, IconButton, Time } from "../../../shared/ui";
import { formatFileSize } from "../../../shared/ui/lib/formatFileSize";
import { deleteComment } from "../api/deleteComment";
import { updateComment } from "../api/updateComment";
import { CommentBodyField } from "./CommentBodyField";

// Edit and Delete are quiet until you point at the comment or tab into it, so a
// long thread is not a wall of buttons. On a touch screen (no hover) they are
// always shown, so nothing is unreachable.
const ACTION_REVEAL =
  "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100";

/** A document attached to the comment: icon, name (a signed download link) and size. */
function FileChip({ file }: { file: Attachment }) {
  return (
    <AttachmentLink
      attachment={file}
      className="inline-flex max-w-full items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--color-border-default)] px-2 py-1 text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-border-default)]"
    >
      <FileText size={14} aria-hidden="true" className="shrink-0" />
      {/* Not a button: text inside the chip's own link, drawn link-like. */}
      {/* eslint-disable-next-line no-restricted-syntax */}
      <span className="truncate text-[var(--color-text-link)] underline">
        {file.filename}
      </span>
      <span className="shrink-0">{formatFileSize(file.sizeBytes)}</span>
    </AttachmentLink>
  );
}

/**
 * One comment on the timeline, as a card with a tinted header strip (the owner
 * picked this layout, Phase 8.5 design pass): avatar, name, relative time (exact
 * date on hover), "(edited)", and Edit/Delete for whoever may use them. The server
 * decides `canEdit`/`canDelete` for this viewer (see listIssueEvents), so there is
 * no role logic here: a button shows exactly when the server would accept it.
 *
 * Delete is a two-step inline confirm, not window.confirm: it stays inside the
 * page, is keyboard reachable, and can be driven like any other UI.
 */
export function CommentCard({
  event,
  files,
  organizationId,
  projectId,
  issueId,
}: {
  event: IssueEvent;
  files: Attachment[];
  organizationId: string;
  projectId: string;
  issueId: string;
}) {
  const queryClient = useQueryClient();
  // The API folds these into issue.commented events (see listIssueEvents).
  const payload = event.payload as {
    commentId: string;
    body: string;
    edited: boolean;
    deleted: boolean;
    canEdit: boolean;
    canDelete: boolean;
  };
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(payload.body);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: issueKeys.events(issueId) });
    void queryClient.invalidateQueries({ queryKey: issueKeys.attachments(issueId) });
  }

  const editMutation = useMutation({
    mutationFn: () =>
      updateComment(organizationId, projectId, issueId, payload.commentId, {
        body: draft,
      }),
    onSuccess: () => {
      setIsEditing(false);
      refresh();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      deleteComment(organizationId, projectId, issueId, payload.commentId),
    onSuccess: refresh,
  });

  if (payload.deleted) {
    return (
      <div className="rounded-[var(--radius-card)] border border-dashed border-[var(--color-border-input)] px-4 py-2 text-sm text-[var(--color-text-muted)] italic">
        Comment deleted · <Time iso={event.createdAt} />
      </div>
    );
  }

  // A picture shown inside the text is not repeated in the strip of thumbnails under it (ADR 0062).
  const shownInText = inlineImageIds(payload.body);
  const strip = files.filter((file) => !shownInText.includes(file.id));

  const showActions =
    !isEditing && !confirmingDelete && (payload.canEdit || payload.canDelete);

  return (
    <div className="group rounded-[var(--radius-card)] bg-[var(--color-bg-surface)] shadow-sm">
      <div className="flex items-center justify-between gap-2 rounded-t-[var(--radius-card)] border-b border-[var(--color-border-default)] bg-[var(--color-border-default)]/40 px-4 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--color-text-muted)]">
          <span className="text-sm font-semibold">
            <PersonName
              organizationId={organizationId}
              userId={event.actorId}
              name={event.actorName}
              withAvatar
              avatarSize="md"
            />
          </span>
          <Time iso={event.createdAt} />
          {payload.edited && <span>(edited)</span>}
        </div>
        {showActions && (
          <div className={`flex shrink-0 items-center gap-1 ${ACTION_REVEAL}`}>
            {payload.canEdit && (
              <IconButton
                label="Edit this comment"
                onClick={() => {
                  setDraft(payload.body);
                  setIsEditing(true);
                }}
              >
                <Pencil size={14} aria-hidden="true" />
              </IconButton>
            )}
            {payload.canDelete && (
              <IconButton label="Delete this comment" tone="danger" onClick={() => setConfirmingDelete(true)}>
                <Trash2 size={14} aria-hidden="true" />
              </IconButton>
            )}
          </div>
        )}
      </div>

      <div className="px-4 py-3">
        {isEditing ? (
          <div className="motion-rise-in flex flex-col gap-2">
            <CommentBodyField
              organizationId={organizationId}
              projectId={projectId}
              issueId={issueId}
              images={files}
              onUploadingChange={setImageUploading}
              value={draft}
              onChange={setDraft}
              ariaLabel="Edit comment"
              autoFocus
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="success"
                disabled={
                  editMutation.isPending || imageUploading || !draft.trim() || draft === payload.body
                }
                onClick={() => editMutation.mutate()}
              >
                {editMutation.isPending ? "Saving…" : "Save"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={editMutation.isPending}
                onClick={() => {
                  setIsEditing(false);
                  setDraft(payload.body);
                }}
              >
                Cancel
              </Button>
            </div>
            {editMutation.isError && <ErrorText>{editMutation.error.message}</ErrorText>}
          </div>
        ) : (
          <div className="text-sm break-words">
            <MentionedText
              organizationId={organizationId}
              body={payload.body}
              renderImage={(attachmentId, alt) => {
                const file = files.find((f) => f.id === attachmentId);
                return file ? <InlineImage attachment={file} alt={alt} /> : `[${alt || "image"}]`;
              }}
            />
          </div>
        )}

        {strip.length > 0 && (
          <div className="mt-3 flex flex-wrap items-start gap-2">
            {strip.map((file) =>
              previewKind(file.mimeType) ? (
                <AttachmentThumbnail key={file.id} attachment={file} />
              ) : (
                <FileChip key={file.id} file={file} />
              ),
            )}
          </div>
        )}

        {confirmingDelete && (
          <div
            role="alertdialog"
            aria-label="Delete comment"
            className="motion-rise-in mt-3 flex flex-col gap-2 border-t border-[var(--color-border-default)] pt-3"
          >
            <p className="text-sm">
              Delete this comment? Its text is removed from the timeline. Any files stay
              in Attachments.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="dangerStrong"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate()}
              >
                {deleteMutation.isPending ? "Deleting…" : "Confirm delete"}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                disabled={deleteMutation.isPending}
                onClick={() => setConfirmingDelete(false)}
              >
                Cancel
              </Button>
            </div>
            {deleteMutation.isError && (
              <ErrorText>{deleteMutation.error.message}</ErrorText>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
