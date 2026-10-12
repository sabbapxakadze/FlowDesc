import type { Invitation } from "@flowdesc/contracts";
import { ROLE_LABELS } from "../../../entities/member";
import { ResendInvitation } from "../../../features/invite-member";
import { Button, cn, Time, useRowMotionProps, type RowState } from "../../../shared/ui";

const MUTED = "text-[var(--color-text-muted)]";

/** One pending invitation: a dashed "@" mark, the address, who invited and when (and "Expired"), the role, Send again / Copy link and Revoke. */
export function InvitationRow({
  organizationId,
  invitation,
  state,
  index,
  revoking,
  onRevoke,
}: {
  organizationId: string;
  invitation: Invitation;
  state: RowState;
  index: number;
  revoking: boolean;
  onRevoke: () => void;
}) {
  const { ref, className, style } = useRowMotionProps<HTMLLIElement>(state, index);
  return (
    <li ref={ref} style={style} className={cn("flex flex-wrap items-center gap-3 px-4 py-2.5", className)}>
      <span aria-hidden="true" className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-dashed border-[var(--color-border-input)] text-xs", MUTED)}>
        @
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{invitation.email}</p>
        <p className={cn("text-xs", MUTED)}>
          Invited by {invitation.invitedByName} <Time iso={invitation.createdAt} />
          {invitation.expired && <span className="ml-2 font-medium text-[var(--color-text-warning)]">Expired</span>}
        </p>
      </div>
      <span className="shrink-0 text-xs font-medium">{ROLE_LABELS[invitation.role]}</span>
      <ResendInvitation organizationId={organizationId} invitationId={invitation.id} email={invitation.email} />
      <Button type="button" variant="link" disabled={revoking} onClick={onRevoke}>
        Revoke
      </Button>
    </li>
  );
}
