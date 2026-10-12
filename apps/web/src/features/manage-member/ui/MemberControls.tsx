import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { OrganizationMember } from "@flowdesc/contracts";
import { issueKeys } from "../../../entities/issue";
import { memberKeys } from "../../../entities/member";
import { ConfirmDelete, Dropdown, ErrorText } from "../../../shared/ui";
import { changeMemberRole } from "../api/changeMemberRole";
import { removeMember } from "../api/removeMember";

type ChangeableRole = "admin" | "member" | "viewer";

/**
 * Role dropdown and Remove for one member. The page only renders this for someone the
 * viewer may change (not themselves, not the owner); the API enforces the same rules
 * (ADR 0024), so hiding is for kindness, not security.
 */
export function MemberControls({
  organizationId,
  member,
}: {
  organizationId: string;
  member: OrganizationMember;
}) {
  const queryClient = useQueryClient();
  const refresh = () => queryClient.invalidateQueries({ queryKey: memberKeys.list(organizationId) });

  const roleMutation = useMutation({
    mutationFn: (role: ChangeableRole) => changeMemberRole(organizationId, member.userId, role),
    onSuccess: refresh,
  });
  const removeMutation = useMutation({
    mutationFn: () => removeMember(organizationId, member.userId),
    onSuccess: () => {
      void refresh();
      // Their issues were unassigned: lists and cards showing them must refetch.
      void queryClient.invalidateQueries({ queryKey: issueKeys.all });
    },
  });

  return (
    <div className="flex flex-wrap items-start gap-3">
      <Dropdown
        aria-label={`Role of ${member.name}`}
        value={member.role}
        disabled={roleMutation.isPending}
        onChange={(value) => roleMutation.mutate(value as ChangeableRole)}
        size="sm"
        className="w-auto"
        options={[
          { value: "admin", label: "Admin" },
          { value: "member", label: "Member" },
          { value: "viewer", label: "Viewer" },
        ]}
      />
      <ConfirmDelete
        label="Remove"
        confirmLabel={`Remove ${member.name}`}
        message={`Remove ${member.name} from the organization? They lose access at once and the issues assigned to them become unassigned. Their comments and history stay. You can invite them back later.`}
        onConfirm={() => removeMutation.mutate()}
        isPending={removeMutation.isPending}
        error={removeMutation.isError ? removeMutation.error.message : null}
      />
      {roleMutation.isError && <ErrorText>{roleMutation.error.message}</ErrorText>}
    </div>
  );
}
