import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ALLOWED_ATTACHMENT_MIME_TYPES, MAX_ATTACHMENT_SIZE_BYTES } from "@flowdesc/contracts";
import { issueKeys } from "../../../entities/issue";
import { ApiError } from "../../../shared/api/client";
import { ErrorText } from "../../../shared/ui";
import { uploadAttachment } from "../api/uploadAttachment";

/**
 * Client-side pre-validation against the exact same
 * ALLOWED_ATTACHMENT_MIME_TYPES/MAX_ATTACHMENT_SIZE_BYTES constants the
 * server enforces (see packages/contracts/src/attachment.ts) — quick
 * feedback before a wasted upload, not the real security boundary
 * (multer's server-side fileFilter/limits still fully re-validate).
 */
function validate(file: File): string | null {
  if (!(ALLOWED_ATTACHMENT_MIME_TYPES as readonly string[]).includes(file.type)) {
    return `Files of type "${file.type || "unknown"}" aren't supported.`;
  }
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return `File is too large (max ${Math.round(MAX_ATTACHMENT_SIZE_BYTES / (1024 * 1024))}MB).`;
  }
  return null;
}

export function UploadAttachmentForm({
  organizationId,
  projectId,
  issueId,
}: {
  organizationId: string;
  projectId: string;
  issueId: string;
}) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [clientError, setClientError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (file: File) => uploadAttachment(organizationId, projectId, issueId, file),
    onSuccess: () => {
      if (inputRef.current) inputRef.current.value = "";
      void queryClient.invalidateQueries({ queryKey: issueKeys.attachments(issueId) });
      void queryClient.invalidateQueries({ queryKey: issueKeys.events(issueId) });
    },
  });

  function onFileChosen(file: File) {
    const error = validate(file);
    setClientError(error);
    if (!error) mutation.mutate(file);
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept={ALLOWED_ATTACHMENT_MIME_TYPES.join(",")}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFileChosen(file);
          }}
          disabled={mutation.isPending}
          className="text-sm text-[var(--color-text-muted)] file:mr-3 file:cursor-pointer file:rounded-[var(--radius-control)] file:border file:border-[var(--color-border-input)] file:bg-transparent file:px-3 file:py-1 file:text-sm file:font-medium file:text-[var(--color-text-default)] hover:file:bg-[var(--color-border-default)]"
        />
        {mutation.isPending && <span className="text-xs text-[var(--color-text-muted)]">Uploading…</span>}
      </div>
      {clientError && <ErrorText>{clientError}</ErrorText>}
      {mutation.isError && (
        <ErrorText>
          {mutation.error instanceof ApiError ? mutation.error.message : "Upload failed."}
        </ErrorText>
      )}
    </div>
  );
}
