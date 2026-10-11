import { useMemo } from "react";
import { mentionDisplayName } from "@flowdesk/contracts";
import { RichTextEditor, type RichTextEditorProps } from "../../../shared/ui";
import { useMembers } from "../api/useMembers";
import { memberOptions } from "../lib/memberOptions";

/**
 * The rich-text editor with the organization's people behind `@` (ADR 0033, 0056): what every text box that can mention someone is (the comment
 * box, an issue's description). It holds the STORED Markdown subset, with mentions as `@[Name](user:<id>)`. Pictures (ADR 0062, 0063) work when the
 * caller passes `uploadImage`; where the file goes is the caller's business.
 */
export function MentionEditor({
  organizationId,
  ...editor
}: { organizationId: string } & Omit<RichTextEditorProps, "candidates">) {
  const { data: members } = useMembers(organizationId);
  const candidates = useMemo(
    () =>
      memberOptions(members).map((option) => ({
        id: option.value,
        name: mentionDisplayName(option.label),
        icon: option.icon,
      })),
    [members],
  );
  return <RichTextEditor {...editor} candidates={candidates} />;
}
