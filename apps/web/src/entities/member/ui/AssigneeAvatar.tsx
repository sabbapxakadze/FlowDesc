import { Avatar } from "../../../shared/ui";
import { useMembers } from "../api/useMembers";
import { PersonName } from "./PersonName";

/**
 * The small circle that shows who an issue is assigned to: their photo (or initials), named "Assigned to X".
 * Interactive by default, like every other picture of a person: hovering opens the person card and clicking goes
 * to their profile. `interactive={false}` is the plain picture, for the card that follows the pointer while it is
 * being dragged. Nothing for someone who is no longer in the organization.
 */
export function AssigneeAvatar({
  organizationId,
  userId,
  interactive = true,
  size = "sm",
  align,
}: {
  organizationId: string;
  userId: string;
  interactive?: boolean;
  /** sm = 20px (cards), md = 28px (the Issues list, ADR 0072). */
  size?: "sm" | "md";
  /** "right" at the right edge of a row, so the person card opens leftwards. */
  align?: "left" | "right";
}) {
  const { data: members } = useMembers(organizationId);
  const member = members?.find((m) => m.userId === userId);
  if (!member) return null;
  const label = `Assigned to ${member.name}`;
  if (!interactive) return <Avatar name={member.name} label={label} src={member.avatarUrl} size={size} />;
  return <PersonName organizationId={organizationId} userId={userId} name={member.name} avatarOnly avatarLabel={label} avatarSize={size} align={align} />;
}
