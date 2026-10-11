import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createIssueRequestSchema, type CreateIssueRequest } from "@flowdesk/contracts";
import { issueKeys } from "../../../entities/issue";
import { MentionEditor } from "../../../entities/member";
import { Button, Dialog, ErrorText, Field, Input } from "../../../shared/ui";
import { createIssue } from "../api/createIssue";
import { uploadDraftImage } from "../api/uploadDraftImage";

/**
 * The "New issue" popup (ADR 0035): the same modal Edit uses, opened from the button on both the Issues and the Board page.
 * Title and Description are what the API accepts for a new issue. A click on the dimmed area closes it unless there is unsaved
 * text; Esc, the X and Cancel always close it. Mount it only while it should be open.
 *
 * Gated server-side by requirePermission("manage_issue"), Owner/Admin/Member, not Viewer (see apps/api/src/shared/permissions.ts);
 * the 403 is what actually enforces it, and it shows under the form.
 */
export function CreateIssueDialog({
  organizationId,
  projectId,
  onClose,
}: {
  organizationId: string;
  projectId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<CreateIssueRequest>({ resolver: zodResolver(createIssueRequestSchema) });
  // True while a pasted picture is still uploading: adding the issue waits, since the picture is not in the text yet.
  const [pictureUploading, setPictureUploading] = useState(false);

  const mutation = useMutation({
    mutationFn: (data: CreateIssueRequest) =>
      createIssue(organizationId, projectId, data),
    onSuccess: () => {
      // issueKeys.list(projectId) is a prefix of the filtered lists AND of the board and backlog keys, so one call refreshes
      // whichever page this was opened from.
      void queryClient.invalidateQueries({ queryKey: issueKeys.list(projectId) });
      onClose();
    },
  });

  return (
    <Dialog title="New issue" onClose={onClose} dismissOnBackdrop={!isDirty}>
      <form
        onSubmit={handleSubmit((data) => mutation.mutate(data))}
        className="flex flex-col gap-3"
      >
        <Field label="Title" error={errors.title?.message}>
          <Input data-autofocus {...register("title")} placeholder="Something to do" />
        </Field>
        {/* Not a <Field>/<label>: a label would wrap the editor's toolbar buttons. The editor names itself. */}
        <div className="flex flex-col gap-1.5 text-sm font-medium">
          <span>Description</span>
          <Controller
            control={control}
            name="description"
            render={({ field }) => (
              <MentionEditor
                organizationId={organizationId}
                value={field.value ?? ""}
                onChange={field.onChange}
                ariaLabel="Description"
                placeholder="Optional"
                uploadImage={async (file) => {
                  const stored = await uploadDraftImage(organizationId, projectId, file);
                  return {
                    id: stored.id,
                    url: stored.downloadUrl,
                    name: stored.filename,
                  };
                }}
                onUploadingChange={setPictureUploading}
              />
            )}
          />
          {errors.description?.message && (
            <p className="text-xs font-normal text-[var(--color-text-danger)]">
              {errors.description.message}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            pending={mutation.isPending}
            disabled={pictureUploading}
            variant="success"
          >
            {mutation.isPending
              ? "Adding…"
              : pictureUploading
                ? "Uploading picture…"
                : "Add issue"}
          </Button>
        </div>
        {mutation.isError && <ErrorText>{mutation.error.message}</ErrorText>}
      </form>
    </Dialog>
  );
}
