import { useEffect, useMemo, useRef, useState, type ClipboardEvent } from "react";
import { useLocation } from "react-router";
import { useMutation } from "@tanstack/react-query";
import { Bug, ImagePlus, X } from "lucide-react";
import { BUG_REPORT_IMAGE_TYPES, BUG_REPORT_MAX_DESCRIPTION } from "@flowdesc/contracts";
import { ApiError } from "../../../shared/api/client";
import { useAuth } from "../../../shared/auth/useAuth";
import { Button, Dialog, ErrorText, Field, IconButton, Textarea } from "../../../shared/ui";
import { sendBugReport } from "../api/sendBugReport";
import { addScreenshots } from "../lib/screenshots";

/**
 * "Report a bug" (ADR 0075): a small bug icon that opens a form with a description and up to three screenshots, sent by email to the owner.
 * A demo copy shows nothing (the server refuses it too). The icon is in the sidebar's bottom row.
 */
export function ReportBug() {
  const { organization } = useAuth();
  const [open, setOpen] = useState(false);
  if (organization?.demoExpiresAt) return null;
  return (
    <>
      <IconButton label="Report a bug" title="Report a bug" tone="sidebar" onClick={() => setOpen(true)}>
        <Bug size={16} aria-hidden="true" />
      </IconButton>
      {open && <ReportBugDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function ReportBugDialog({ onClose }: { onClose: () => void }) {
  const location = useLocation();
  const fileInput = useRef<HTMLInputElement>(null);
  const [description, setDescription] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [problem, setProblem] = useState<string | null>(null);

  // A small picture of each file, made here and given back when the file goes or the dialog closes.
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  const send = useMutation({
    mutationFn: () =>
      sendBugReport({
        description: description.trim(),
        // The path and query only: never the address fragment.
        page: `${location.pathname}${location.search}`.slice(0, 500),
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        files,
      }),
  });

  const add = (offered: File[]) => {
    const result = addScreenshots(files, offered);
    setFiles(result.files);
    setProblem(result.problem);
  };

  // A picture pasted anywhere in the dialog (a copied screenshot) is added, like choosing it. Text pastes are left alone.
  const onPaste = (event: ClipboardEvent) => {
    const pictures = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
    if (pictures.length === 0) return;
    event.preventDefault();
    add(pictures);
  };

  const tooShort = description.trim().length === 0;
  const failure = send.isError ? (send.error instanceof ApiError || send.error instanceof Error ? send.error.message : "Something went wrong.") : null;

  return (
    <Dialog title="Report a bug" onClose={onClose} dismissOnBackdrop={false} className="max-w-lg">
      {send.isSuccess ? (
        <div role="status" className="flex flex-col gap-4 text-sm">
          <p>
            <strong>Thank you, your report was sent.</strong> If we need more details, we will reply to the email on your account.
          </p>
          <div>
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      ) : (
        <form
          onPaste={onPaste}
          onSubmit={(event) => {
            event.preventDefault();
            if (!tooShort) send.mutate();
          }}
          className="flex flex-col gap-4 text-sm"
        >
          <p className="text-[var(--color-text-muted)]">
            Tell us what went wrong and what you expected. We receive your name and email (so we can reply), your organization, the page you are on and
            your browser.
          </p>
          <Field label="What went wrong?">
            <Textarea
              data-autofocus
              rows={5}
              maxLength={BUG_REPORT_MAX_DESCRIPTION}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="For example: I dragged a card and the board went blank."
            />
          </Field>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" variant="secondary" size="sm" onClick={() => fileInput.current?.click()} disabled={files.length >= 3}>
                <ImagePlus size={14} aria-hidden="true" />
                Add screenshots
              </Button>
              <input
                ref={fileInput}
                type="file"
                accept={BUG_REPORT_IMAGE_TYPES.join(",")}
                multiple
                className="sr-only"
                aria-label="Choose screenshots"
                tabIndex={-1}
                onChange={(event) => {
                  add(Array.from(event.target.files ?? []));
                  event.target.value = ""; // so choosing the same file again still counts
                }}
              />
              <span className="text-xs text-[var(--color-text-muted)]">Up to 3 pictures, 5 MB each. You can also paste one here.</span>
            </div>
            {files.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label="Screenshots to send">
                {files.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="relative h-16 w-24 overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-border-default)]">
                    <img src={previews[index]} alt={`Screenshot ${index + 1}: ${file.name || "pasted picture"}`} className="h-full w-full object-cover" />
                    <IconButton
                      label={`Remove screenshot ${index + 1}`}
                      className="absolute top-0.5 right-0.5 bg-[var(--color-bg-surface)]/90"
                      onClick={() => {
                        setFiles(files.filter((_, i) => i !== index));
                        setProblem(null);
                      }}
                    >
                      <X size={12} aria-hidden="true" />
                    </IconButton>
                  </li>
                ))}
              </ul>
            )}
            {problem && <ErrorText>{problem}</ErrorText>}
            <p className="text-xs text-[var(--color-text-muted)]">Screenshots may show private information. Only attach what you are happy to share.</p>
          </div>

          {failure && <ErrorText>{failure}</ErrorText>}
          <div className="flex items-center gap-3">
            <Button type="submit" variant="create" pending={send.isPending} disabled={tooShort}>
              {send.isPending ? "Sending…" : "Send report"}
            </Button>
            <Button type="button" variant="link" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
