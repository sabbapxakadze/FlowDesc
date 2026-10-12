import type { OrganizationMember } from "@flowdesc/contracts";
import { useInvitations, useRevokeInvitation } from "../../entities/invitation";
import { useMembers, useMyRole } from "../../entities/member";
import { InviteMemberForm } from "../../features/invite-member";
import { useAuth } from "../../shared/auth/useAuth";
import { EmptyState, ErrorText, Page, PageHeader, Skeleton, useAnimatedList } from "../../shared/ui";
import { InvitationRow } from "./ui/InvitationRow";
import { MemberRow } from "./ui/MemberRow";

/** The groups of the list, in order; a person is in the one that holds their role. Empty groups are not drawn. */
const GROUPS: { title: string; roles: OrganizationMember["role"][] }[] = [
  { title: "Owner and admins", roles: ["owner", "admin"] },
  { title: "Members", roles: ["member"] },
  { title: "Viewers", roles: ["viewer"] },
];

const SURFACE = "overflow-hidden rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)]";

/**
 * The organization's people, grouped by role (owner's pick C of four mockups, 2026-10-11, ADR 0060), and, for owners and admins, who has been invited.
 * Everyone in the organization can see the member list; the invite form and the pending list are for owners and admins only (the API enforces it with
 * manage_members; hiding them here is just so nobody is offered a button that would be refused). No data changed: the same two reads as before.
 *
 * One list ("Members") in one bordered surface; each group has a heading row (a presentation row, not a list item, so the list holds only people).
 */
export function MembersPage() {
  const { organization, user } = useAuth();
  const organizationId = organization!.id;
  const role = useMyRole(organizationId);
  const canManage = role === "owner" || role === "admin";

  const members = useMembers(organizationId);
  const invitations = useInvitations(organizationId, { enabled: canManage });
  const revoke = useRevokeInvitation(organizationId);
  const memberRows = useAnimatedList(members.data ?? [], (member) => member.userId, { ready: members.isSuccess });
  const invitationRows = useAnimatedList(invitations.data ?? [], (invitation) => invitation.email, { ready: invitations.isSuccess });

  return (
    <Page>
      <PageHeader title="Members" eyebrow={organization!.name} />
      <p className="mb-4 text-sm text-[var(--color-text-muted)]">
        People in {organization!.name}.{members.isSuccess && ` ${members.data.length} ${members.data.length === 1 ? "person" : "people"}.`}
      </p>

      {canManage && <InviteMemberForm organizationId={organizationId} />}

      {members.isPending ? (
        <div className={SURFACE}>
          <Skeleton className="m-4 h-10" />
          <Skeleton className="m-4 h-10" />
        </div>
      ) : members.isError ? (
        <ErrorText>Failed to load members: {members.error.message}</ErrorText>
      ) : (
        <ul aria-label="Members" className={`${SURFACE} divide-y divide-[var(--color-border-default)]`}>
          {GROUPS.map((group) => {
            const rows = memberRows
              .filter((row) => group.roles.includes(row.item.role))
              .sort((a, b) => Number(b.item.role === "owner") - Number(a.item.role === "owner"));
            if (rows.length === 0) return null;
            return [
              <li key={`group-${group.title}`} role="presentation" className="bg-[var(--color-border-default)]/30 px-4 py-1.5 text-xs font-semibold tracking-wide text-[var(--color-text-muted)] uppercase">
                {group.title} <span className="font-normal">{rows.length}</span>
              </li>,
              ...rows.map(({ key, item: member, state, index }) => (
                <MemberRow key={key} organizationId={organizationId} member={member} isMe={member.userId === user?.id} canManage={canManage} state={state} index={index} />
              )),
            ];
          })}
        </ul>
      )}

      {canManage && (
        <section className="mt-8">
          <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold">
            Pending invitations
            {invitations.isSuccess && <span className="font-normal text-[var(--color-text-muted)]">{invitations.data.length}</span>}
          </h2>
          {invitations.isPending ? (
            <Skeleton className="h-12 w-full" />
          ) : invitations.isError ? (
            <ErrorText>Failed to load invitations: {invitations.error.message}</ErrorText>
          ) : invitationRows.length === 0 ? (
            <EmptyState block>No pending invitations.</EmptyState>
          ) : (
            // Rows are keyed by email, not id: a re-send replaces the row with a new id, and the new link it shows must survive that refetch.
            <ul aria-label="Pending invitations" className={`${SURFACE} divide-y divide-[var(--color-border-default)]`}>
              {invitationRows.map(({ item: invitation, state, index }) => (
                <InvitationRow
                  key={invitation.email}
                  organizationId={organizationId}
                  invitation={invitation}
                  state={state}
                  index={index}
                  revoking={revoke.isPending}
                  onRevoke={() => revoke.mutate(invitation.id)}
                />
              ))}
            </ul>
          )}
          {revoke.isError && <ErrorText className="mt-2">{revoke.error.message}</ErrorText>}
        </section>
      )}
    </Page>
  );
}
