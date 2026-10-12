import { useQuery } from "@tanstack/react-query";
import { profileNudgeResponseSchema } from "@flowdesc/contracts";
import { apiGet } from "../../../shared/api/client";
import { profileKeys } from "./queryKeys";

/**
 * Whether to show the "Finish your profile" card. Kept under profileKeys.all, so saving the
 * profile, uploading a photo or dismissing the card (which all invalidate that prefix) refreshes it.
 */
export function useProfileNudge(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: [...profileKeys.all, "nudge"] as const,
    queryFn: () => apiGet("/v1/users/me/profile-nudge", profileNudgeResponseSchema).then((res) => res.show),
    enabled: options.enabled ?? true,
    staleTime: 60_000,
  });
}
