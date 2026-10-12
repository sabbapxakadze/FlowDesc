import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Attachment } from "@flowdesc/contracts";
import { issueKeys } from "../api/queryKeys";

/**
 * State shared by everything that previews an attachment (the link, the comment
 * thumbnail): is the popup open, and which URL to request.
 *
 * The signed download link lives only 5 minutes and is minted when the attachment
 * list is fetched, so a page left open can hold an expired link. When a file fails to
 * load, `onLoadError` refetches the list once; the parent re-renders with the fresh
 * link and `attempt` is bumped so the file is requested again even when the refreshed
 * link happens to be identical (a refetch within the same second mints the same
 * signature; the server ignores query parameters it does not know). Opening the popup
 * allows one more refresh, so a thumbnail that already used its retry does not stop
 * the popup from recovering.
 */
export function useAttachmentPreview(attachment: Attachment) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const retried = useRef(false);
  const [attempt, setAttempt] = useState(0);

  return {
    open,
    show() {
      retried.current = false;
      setOpen(true);
    },
    close() {
      setOpen(false);
    },
    src: attempt === 0 ? attachment.downloadUrl : `${attachment.downloadUrl}&retry=${attempt}`,
    onLoadError() {
      if (retried.current) return;
      retried.current = true;
      void queryClient
        .invalidateQueries({ queryKey: issueKeys.attachments(attachment.issueId) })
        .then(() => setAttempt((n) => n + 1));
    },
  };
}
