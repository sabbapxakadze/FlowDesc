import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiDeleteVoid } from "../../../shared/api/client";
import { apiTokenKeys } from "./queryKeys";

/** Revoking stops the token working on its next request; the row stays in the list, marked Revoked. */
export function useRevokeApiToken() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tokenId: string) => apiDeleteVoid(`/v1/users/me/api-tokens/${tokenId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: apiTokenKeys.list });
    },
  });
}
