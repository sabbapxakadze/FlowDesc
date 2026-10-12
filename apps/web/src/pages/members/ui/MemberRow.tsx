import type { OrganizationMember } from "@flowdesc/contracts";
import { PersonName, ROLE_LABELS } from "../../../entities/member";
import { MemberControls } from "../../../features/manage-member";
import { cn, Time, useRowMotionProps, type RowState } from "../../../shared/ui";

const MUTED = "text-[var(--color-text-muted)]";

/**
 * One person in the Members list (the owner's pick C, grouped by role, ADR 0060): their photo, name (and "(you)"), job title and email, a pill for
 * owners and admins (the other groups are named by their heading), when they joined, and, for someone an owner or admin may change, the role box and Remove.
 * Rows open, flash and close like the other animated lists.
 */
export function MemberRow({
  organizationId,
  member,
  isMe,
  canManage,
  state,
  index,
}: {
  organizationId: string;
  member: OrganizationMember;
  isMe: boolean;
  canManage: boolean;
  state: RowState;
  index: number;
}) {
  const { ref, className, style } = useRowMotionProps<HTMLLIElement>(state, index);
  const pill = member.role === "owner" || member.role === "admin";
  return (
    <li ref={ref} style={style} className={cn("px-4 py-2.5", className)}>
      <div className="flex flex-wrap items-center gap-3">
        <PersonName organizationId={organizationId} userId={member.userId} name={member.name} avatarOnly avatarSize="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            <PersonName organizationId={organizationId} userId={member.userId} name={member.name} />
            {isMe && <span className={cn("ml-2 text-xs font-normal", MUTED)}>(you)</span>}
          </p>
          <p className={cn("truncate text-xs", MUTED)}>
            {member.jobTitle ? `${member.jobTitle} \u00b7 ` : ""}
            {member.email}
          </p>
        </div>
        {pill && (
          <span
            className={cn(
              "shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium",
              member.role === "owner"
                ? "border-[color-mix(in_oklab,var(--color-accent-500)_45%,transparent)] bg-[color-mix(in_oklab,var(--color-accent-500)_16%,transparent)] text-[var(--color-text-link)]"
                : cn("border-[var(--color-border-input)]", MUTED),
            )}
          >
            {ROLE_LABELS[member.role]}
          </span>
        )}
        <span className={cn("hidden shrink-0 text-xs sm:inline", MUTED)}>
          Joined <Time iso={member.joinedAt} />
        </span>
        {/* Not for yourself and never for the owner: the API refuses both (ADR 0024). */}
        {canManage && !isMe && member.role !== "owner" && (
          <div className="w-full sm:w-auto">
            <MemberControls organizationId={organizationId} member={member} />
          </div>
        )}
      </div>
    </li>
  );
}
