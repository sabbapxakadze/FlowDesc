import { createPortal } from "react-dom";
import type { Attachment } from "@flowdesk/contracts";
import { MediaPreviewDialog } from "../../../shared/ui";
import { formatFileSize } from "../../../shared/ui/lib/formatFileSize";
import { useAttachmentPreview } from "./useAttachmentPreview";

/**
 * A picture inside a comment's text (ADR 0062). Click opens the same zoom popup as a comment's thumbnails (ADR 0023); a link that expired is
 * refetched on a load error, like there. Drawn at a limited height so a screenshot does not take over the timeline. The popup is a <dialog>, which
 * may not sit inside the comment's paragraph, so it is drawn on the page body instead.
 */
export function InlineImage({
  attachment,
  alt,
}: {
  attachment: Attachment;
  alt: string;
}) {
  const preview = useAttachmentPreview(attachment);
  return (
    <>
      <a
        href={attachment.downloadUrl}
        target="_blank"
        rel="noreferrer"
        aria-label={`Open ${alt || attachment.filename}`}
        onClick={(e) => {
          if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          preview.show();
        }}
        className="my-1 inline-block max-w-full align-bottom focus-visible:outline-2 focus-visible:outline-[var(--color-border-focus)]"
      >
        <img
          src={preview.src}
          alt={alt}
          loading="lazy"
          onError={preview.onLoadError}
          className="max-h-64 max-w-full rounded-[var(--radius-control)] border border-[var(--color-border-default)] object-contain"
        />
      </a>
      {preview.open &&
        createPortal(
          <MediaPreviewDialog
            kind="image"
            src={preview.src}
            filename={attachment.filename}
            sizeLabel={formatFileSize(attachment.sizeBytes)}
            onClose={preview.close}
            onLoadError={preview.onLoadError}
          />,
          document.body,
        )}
    </>
  );
}
