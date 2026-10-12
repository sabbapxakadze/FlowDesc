import { useRef, useState } from "react";
import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES } from "@flowdesc/contracts";
import { Avatar, Button, ErrorText } from "../../../shared/ui";
import { useRemoveAvatar, useUploadAvatar } from "../api/profileMutations";

/**
 * The photo part of the edit form. A photo applies right away (choosing a file uploads it,
 * Remove deletes it); it is not held back until Save, because it is a separate upload with its
 * own failure modes. The same limits the server enforces are checked here first so a wrong file
 * gets a message before any upload; the server still decodes the bytes and is the real check.
 */
export function AvatarEditor({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const upload = useUploadAvatar();
  const remove = useRemoveAvatar();
  const busy = upload.isPending || remove.isPending;

  function onFileChosen(file: File) {
    setProblem(null);
    if (!(AVATAR_MIME_TYPES as readonly string[]).includes(file.type)) {
      setProblem("Choose a PNG, JPEG or WebP picture.");
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setProblem("The photo must be 5 MB or smaller.");
      return;
    }
    upload.mutate(file, { onError: (err) => setProblem(err.message) });
  }

  return (
    <div className="flex items-center gap-5">
      <Avatar name={name} src={avatarUrl} size="lg" />
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => inputRef.current?.click()}>
            {upload.isPending ? "Uploading…" : avatarUrl ? "Change photo" : "Upload photo"}
          </Button>
          {avatarUrl && (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setProblem(null);
                remove.mutate(undefined, { onError: (err) => setProblem(err.message) });
              }}
            >
              Remove
            </Button>
          )}
        </div>
        <p className="text-xs text-[var(--color-text-muted)]">
          PNG, JPEG or WebP, up to 5 MB. It is cropped to a square and shrunk. Photo changes apply right away.
        </p>
        {problem && <ErrorText>{problem}</ErrorText>}
        <input
          ref={inputRef}
          type="file"
          aria-label="Photo file"
          accept={AVATAR_MIME_TYPES.join(",")}
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // so choosing the same file again still fires
            if (file) onFileChosen(file);
          }}
        />
      </div>
    </div>
  );
}
