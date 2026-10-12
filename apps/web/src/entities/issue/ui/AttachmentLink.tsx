import type { ReactNode } from "react";
import type { Attachment } from "@flowdesc/contracts";
import { MediaPreviewDialog } from "../../../shared/ui";
import { formatFileSize } from "../../../shared/ui/lib/formatFileSize";
import { previewKind } from "../lib/previewKind";
import { useAttachmentPreview } from "./useAttachmentPreview";

/**
 * The one way an attachment is linked, used by the attachment list and by the files
 * on a comment. Images and videos open in a preview popup (zoom or player controls,
 * Download); everything else keeps the old behaviour: a plain link, opened in a new
 * tab.
 *
 * The media link is still a real <a href>: a middle click, a ctrl/cmd click or
 * "open in new tab" skip the popup and open the file the normal way.
 *
 * Expired signed links are handled in useAttachmentPreview.
 */
export function AttachmentLink({
  attachment,
  className,
  children,
}: {
  attachment: Attachment;
  className?: string;
  children: ReactNode;
}) {
  const preview = useAttachmentPreview(attachment);
  const kind = previewKind(attachment.mimeType);

  if (!kind) {
    return (
      <a href={attachment.downloadUrl} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    );
  }

  return (
    <>
      <a
        href={attachment.downloadUrl}
        target="_blank"
        rel="noreferrer"
        className={className}
        onClick={(e) => {
          if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          preview.show();
        }}
      >
        {children}
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
