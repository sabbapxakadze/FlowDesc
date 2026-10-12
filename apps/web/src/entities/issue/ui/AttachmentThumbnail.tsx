import { Play } from "lucide-react";
import type { Attachment } from "@flowdesc/contracts";
import { MediaPreviewDialog } from "../../../shared/ui";
import { formatFileSize } from "../../../shared/ui/lib/formatFileSize";
import { previewKind } from "../lib/previewKind";
import { useAttachmentPreview } from "./useAttachmentPreview";

/**
 * A small square preview of an image or video attached to a comment; clicking it
 * opens the same popup as the attachment list. No thumbnail files are generated:
 * the browser scales the original down (ADR 0023), which is fine at the 10 MB cap.
 * A video shows its first frame (`#t=0.1` asks for a frame just after the start;
 * browsers fetch only the metadata and that frame) with a play badge on top.
 *
 * Renders nothing for a file that is not previewable; the caller shows those as
 * plain chips instead.
 */
export function AttachmentThumbnail({ attachment }: { attachment: Attachment }) {
  const preview = useAttachmentPreview(attachment);
  const kind = previewKind(attachment.mimeType);
  if (!kind) return null;

  return (
    <>
      <a
        href={attachment.downloadUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={`${kind === "video" ? "Play" : "Preview"} ${attachment.filename}`}
        title={`${attachment.filename} (${formatFileSize(attachment.sizeBytes)})`}
        onClick={(e) => {
          if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          preview.show();
        }}
        className="relative block h-24 w-24 shrink-0 overflow-hidden rounded-[var(--radius-control)] border border-[var(--color-border-default)] bg-[var(--color-bg-page)] hover:border-[var(--color-border-focus)] focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)]"
      >
        {kind === "image" ? (
          <img
            src={preview.src}
            alt=""
            loading="lazy"
            draggable={false}
            onError={preview.onLoadError}
            className="h-full w-full object-cover"
          />
        ) : (
          <>
            <video
              src={`${preview.src}#t=0.1`}
              preload="metadata"
              muted
              playsInline
              tabIndex={-1}
              onError={preview.onLoadError}
              className="h-full w-full object-cover"
            />
            <span
              aria-hidden="true"
              className="absolute inset-0 m-auto flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white"
            >
              <Play size={14} fill="currentColor" />
            </span>
          </>
        )}
      </a>
      {preview.open && (
        <MediaPreviewDialog
          kind={kind}
          src={preview.src}
          filename={attachment.filename}
          sizeLabel={formatFileSize(attachment.sizeBytes)}
          onClose={preview.close}
          onLoadError={preview.onLoadError}
        />
      )}
    </>
  );
}
