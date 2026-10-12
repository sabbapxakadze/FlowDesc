import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Label } from "@flowdesc/contracts";
import { issueKeys } from "../../../entities/issue";
import { labelKeys } from "../../../entities/label";
import { ConfirmDelete } from "../../../shared/ui";
import { deleteLabel } from "../api/deleteLabel";

/** Owner/admin only (the API refuses anyone else); the page decides whether to show it. */
export function DeleteLabelButton({
  organizationId,
  label,
}: {
  organizationId: string;
  label: Label;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => deleteLabel(organizationId, label.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: labelKeys.list(organizationId) });
      // Issues cache their own label lists under issueKeys.all.
      void queryClient.invalidateQueries({ queryKey: issueKeys.all });
    },
  });

  return (
    <ConfirmDelete
      label="Delete"
      message={`Delete the label "${label.name}"? It is removed from every issue that uses it. This cannot be undone.`}
      confirmLabel="Delete label"
      onConfirm={() => mutation.mutate()}
      isPending={mutation.isPending}
      error={mutation.isError ? mutation.error.message : null}
    />
  );
}
