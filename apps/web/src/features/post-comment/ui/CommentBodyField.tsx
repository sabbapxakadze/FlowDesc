import type { Attachment } from "@flowdesk/contracts";
import { MentionEditor } from "../../../entities/member";
import { uploadDraftImage } from "../api/uploadDraftImage";

/**
 * The comment text box (ADR 0033 for @mentions, ADR 0056 for formatting, ADR 0062 for pictures): the shared mention editor, with pasted
 * pictures uploaded as drafts of this issue.
 */
export function CommentBodyField({
  organizationId,
  projectId,
  issueId,
  images,
  onUploadingChange,
  value,
  onChange,
  placeholder,
  ariaLabel,
  autoFocus,
}: {
  organizationId: string;
  projectId: string;
  issueId: string;
  /** Pictures already stored for this comment, so editing it can show them. */
  images?: Attachment[];
  /** True while a pasted picture is still uploading: the form waits before posting. */
  onUploadingChange?: (uploading: boolean) => void;
  /** The stored body. */
  value: string;
  onChange: (body: string) => void;
  placeholder?: string;
  ariaLabel: string;
  autoFocus?: boolean;
}) {
  return (
    <MentionEditor
      organizationId={organizationId}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      ariaLabel={ariaLabel}
      autoFocus={autoFocus}
      uploadImage={async (file) => {
        const stored = await uploadDraftImage(organizationId, projectId, issueId, file);
        return { id: stored.id, url: stored.downloadUrl, name: stored.filename };
      }}
      images={images?.map((image) => ({ id: image.id, url: image.downloadUrl }))}
      onUploadingChange={onUploadingChange}
    />
  );
}
