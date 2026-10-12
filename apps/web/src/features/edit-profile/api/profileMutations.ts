import { useMutation, useQueryClient } from "@tanstack/react-query";
import { avatarResponseSchema, type UpdateProfileRequest } from "@flowdesc/contracts";
import { memberKeys } from "../../../entities/member";
import { profileKeys } from "../../../entities/profile";
import { apiDelete, apiPatchVoid, apiUpload } from "../../../shared/api/client";

/**
 * Anything that changes how a person looks (name, title, bio, photo) is shown in the member
 * list, hover cards and profile pages, so a success refreshes both of those caches. Other
 * people's open tabs get the same through the "members" live update.
 */
function useRefreshPeople() {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: memberKeys.all });
    void queryClient.invalidateQueries({ queryKey: profileKeys.all });
  };
}

export function useUpdateProfile() {
  const refresh = useRefreshPeople();
  return useMutation({
    mutationFn: (data: UpdateProfileRequest) => apiPatchVoid("/v1/users/me/profile", data),
    onSuccess: refresh,
  });
}

export function useUploadAvatar() {
  const refresh = useRefreshPeople();
  return useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return apiUpload("/v1/users/me/avatar", form, avatarResponseSchema, "PUT");
    },
    onSuccess: refresh,
  });
}

export function useRemoveAvatar() {
  const refresh = useRefreshPeople();
  return useMutation({
    mutationFn: () => apiDelete("/v1/users/me/avatar", avatarResponseSchema),
    onSuccess: refresh,
  });
}
