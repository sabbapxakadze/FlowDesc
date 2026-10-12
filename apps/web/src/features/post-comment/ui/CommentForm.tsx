import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ALLOWED_ATTACHMENT_MIME_TYPES, MAX_ATTACHMENT_SIZE_BYTES } from "@flowdesc/contracts";
import { issueKeys } from "../../../entities/issue";
import { ApiError } from "../../../shared/api/client";
import { Button, ErrorText } from "../../../shared/ui";
import { createComment } from "../api/createComment";
import { uploadCommentFile } from "../api/uploadCommentFile";
import { CommentBodyField } from "./CommentBodyField";

type FormValues = { body: string };

/**
 * Same rule the server enforces (shared constants); quick feedback before a
 * wasted upload, not the security boundary.
 */
function validateFile(file: File): string | null {
  if (!(ALLOWED_ATTACHMENT_MIME_TYPES as readonly string[]).includes(file.type)) {
    return `"${file.name}": files of type "${file.type || "unknown"}" aren't supported.`;
  }
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return `"${file.name}" is too large (max ${Math.round(MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024))}MB).`;
  }
  return null;
}

/**
 * Posts the comment first, then uploads each chosen file with its commentId,
 * one at a time. If a file fails the comment stays posted and the message
 * names each failed file: a failed upload must never lose the typed text.
 */
export function CommentForm({
  organizationId,
  projectId,
  issueId,
}: {
  organizationId: string;
  projectId: string;
  issueId: string;
}) {
  const queryClient = useQueryClient();
  const { control, handleSubmit, reset } = useForm<FormValues>({ defaultValues: { body: "" } });
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [fileErrors, setFileErrors] = useState<string[]>([]);
  const [imageUploading, setImageUploading] = useState(false);

  const mutation = useMutation({
    mutationFn: async ({ body, chosen }: { body: string; chosen: File[] }) => {
      const comment = await createComment(organizationId, projectId, issueId, { body });
      const failures: string[] = [];
      for (const file of chosen) {
        try {
          await uploadCommentFile(organizationId, projectId, issueId, comment.id, file);
        } catch (error) {
          const reason = error instanceof ApiError ? error.message : "upload failed";
          failures.push(`"${file.name}" was not attached: ${reason}`);
        }
      }
      return failures;
    },
    onSuccess: (failures) => {
      reset();
      setFiles([]);
      setFileErrors(failures);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: issueKeys.events(issueId) });
      void queryClient.invalidateQueries({ queryKey: issueKeys.attachments(issueId) });
    },
  });

  function onFilesChosen(list: FileList | null) {
    if (!list) return;
    const errors: string[] = [];
    const accepted: File[] = [];
    for (const file of Array.from(list)) {
      const error = validateFile(file);
      if (error) errors.push(error);
      else accepted.push(file);
    }
    setFiles((current) => [...current, ...accepted]);
    setFileErrors(errors);
    // Reset so choosing the same file again still fires onChange.
    if (inputRef.current) inputRef.current.value = "";
  }

  return (
    <form
      onSubmit={handleSubmit((data) => {
        if (!data.body.trim()) return;
        setFileErrors([]);
        mutation.mutate({ body: data.body, chosen: files });
      })}
      className="flex flex-col gap-2"
    >
      <Controller
        control={control}
        name="body"
        rules={{ required: true }}
        render={({ field }) => (
          <CommentBodyField
            organizationId={organizationId}
            projectId={projectId}
            issueId={issueId}
            value={field.value}
            onChange={field.onChange}
            onUploadingChange={setImageUploading}
            placeholder="Add a comment…"
            ariaLabel="Comment"
          />
        )}
      />
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex items-center gap-1 rounded-[var(--radius-control)] border border-[var(--color-border-input)] px-2 py-0.5 text-xs text-[var(--color-text-muted)]"
            >
              {file.name}
              <button
                type="button"
                aria-label={`Remove ${file.name}`}
                disabled={mutation.isPending}
                onClick={() => setFiles((current) => current.filter((_, i) => i !== index))}
                className="text-[var(--color-text-default)] hover:underline disabled:opacity-50"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex items-center gap-2">
        {/* A picture still uploading is not in the text yet: posting now would leave it out. */}
        <Button type="submit" size="sm" pending={mutation.isPending} disabled={imageUploading}>
          {mutation.isPending ? "Posting…" : imageUploading ? "Uploading picture…" : "Comment"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={mutation.isPending}
          onClick={() => inputRef.current?.click()}
        >
          Attach files
        </Button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ALLOWED_ATTACHMENT_MIME_TYPES.join(",")}
          onChange={(e) => onFilesChosen(e.target.files)}
          className="hidden"
          aria-label="Attach files to comment"
        />
      </div>
      {fileErrors.map((message) => (
        <ErrorText key={message}>{message}</ErrorText>
      ))}
      {mutation.isError && <ErrorText>{mutation.error.message}</ErrorText>}
    </form>
  );
}
