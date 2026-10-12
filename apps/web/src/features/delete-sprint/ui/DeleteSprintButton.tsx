import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Sprint } from "@flowdesk/contracts";
import { issueKeys } from "../../../entities/issue";
import { sprintKeys } from "../../../entities/sprint";
import { ConfirmDelete } from "../../../shared/ui";
import { deleteSprint } from "../api/deleteSprint";

/**
 * Not offered for an active sprint (the API refuses it with a 409 as well);
 * the page decides. Issues in the sprint are kept and go back to the backlog.
 */
export function DeleteSprintButton({
  organizationId,
  projectId,
  sprint,
  startAsking,
  onCancel,
}: {
  organizationId: string;
  projectId: string;
  sprint: Sprint;
  /** Show the question at once (the page opens it from the sprint menu). */
  startAsking?: boolean;
  onCancel?: () => void;
}) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => deleteSprint(organizationId, projectId, sprint.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sprintKeys.list(projectId) });
      void queryClient.invalidateQueries({ queryKey: issueKeys.backlog(projectId) });
    },
  });

  return (
    <ConfirmDelete
      label="Delete"
      message={`Delete the sprint "${sprint.name}"? Issues in it go back to the backlog. This cannot be undone.`}
      confirmLabel="Delete sprint"
      onConfirm={() => mutation.mutate()}
      isPending={mutation.isPending}
      startAsking={startAsking}
      onCancel={onCancel}
      error={mutation.isError ? mutation.error.message : null}
    />
  );
}
