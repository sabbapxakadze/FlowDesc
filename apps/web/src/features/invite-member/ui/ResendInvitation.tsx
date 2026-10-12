import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createInvitationResponseSchema } from "@flowdesc/contracts";
import { invitationKeys } from "../../../entities/invitation";
import { apiPost } from "../../../shared/api/client";
import { Button, ErrorText, Input } from "../../../shared/ui";

/**
 * Re-send for one pending invitation: the server revokes the old link and issues a new
 * one (fresh 7 days), emails it, and returns it. As when first inviting, the new link is
 * shown once with a Copy button, because the server keeps only a hash and the email may
 * not arrive.
 */
export function ResendInvitation({
  organizationId,
  invitationId,
  email,
}: {
  organizationId: string;
  invitationId: string;
  email: string;
}) {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const mutation = useMutation({
    mutationFn: () =>
      apiPost(
        `/v1/organizations/${organizationId}/invitations/${invitationId}/resend`,
        {},
        createInvitationResponseSchema,
      ),
    onSuccess: () => {
      setCopied(false);
      void queryClient.invalidateQueries({ queryKey: invitationKeys.list(organizationId) });
    },
  });

  if (mutation.isSuccess) {
    const { inviteUrl } = mutation.data;
    return (
      <div className="flex w-full flex-wrap items-center gap-2">
        <p className="w-full text-xs text-[var(--color-text-muted)]">
          New link for {email}. The old one no longer works. Shown only now.
        </p>
        <Input readOnly aria-label={`New invitation link for ${email}`} value={inviteUrl} className="min-w-0 flex-1" onFocus={(e) => e.currentTarget.select()} />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(inviteUrl).then(() => setCopied(true));
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
      </div>
    );
  }

  return (
    <>
      <Button type="button" variant="link" disabled={mutation.isPending} onClick={() => mutation.mutate()}>
        {mutation.isPending ? "Sending…" : "Re-send"}
      </Button>
      {mutation.isError && <ErrorText>{mutation.error.message}</ErrorText>}
    </>
  );
}
