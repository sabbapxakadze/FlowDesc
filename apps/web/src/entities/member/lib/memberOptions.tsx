import type { OrganizationMember } from "@flowdesc/contracts";
import { Avatar, type DropdownOption } from "../../../shared/ui";

/** People as dropdown options: their photo (or initials) before the name. Extra rows ("Unassigned") go first. */
export function memberOptions(members: OrganizationMember[] | undefined): DropdownOption[] {
  return (members ?? []).map((member) => ({
    value: member.userId,
    label: member.name,
    icon: <Avatar name={member.name} src={member.avatarUrl} size="sm" />,
  }));
}
