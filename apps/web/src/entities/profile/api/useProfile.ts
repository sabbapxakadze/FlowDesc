import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { profileActivityResponseSchema, profileResponseSchema } from "@flowdesc/contracts";
import { apiGet } from "../../../shared/api/client";
import { profileKeys } from "./queryKeys";

const base = (organizationId: string, userId: string) =>
  `/v1/organizations/${organizationId}/members/${userId}`;

/** One person's profile. A person who is not in the organization is a 404 (shown as "not found"). */
export function useProfile(organizationId: string, userId: string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: profileKeys.detail(organizationId, userId),
    queryFn: () => apiGet(`${base(organizationId, userId)}/profile`, profileResponseSchema).then((res) => res.data),
    enabled: options.enabled ?? true,
    staleTime: 60_000,
  });
}

/** Their recent activity, newest first, ten at a time (cursor paging like the issue list). */
export function useProfileActivity(organizationId: string, userId: string) {
  return useInfiniteQuery({
    queryKey: profileKeys.activity(organizationId, userId),
    queryFn: ({ pageParam }: { pageParam: string | undefined }) =>
      apiGet(
        `${base(organizationId, userId)}/activity${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""}`,
        profileActivityResponseSchema,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}
