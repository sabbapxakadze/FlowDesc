import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AssignIssueSprintRequest, GetBacklogResponse } from "@flowdesc/contracts";
import { issueKeys } from "../../entities/issue";
import { ApiError } from "../../shared/api/client";
import { assignIssueSprint } from "./api/assignIssueSprint";

type AssignVariables = { issueId: string } & AssignIssueSprintRequest;
type AssignContext = { previousBacklog: GetBacklogResponse | undefined };

/**
 * A hook, not form-inlined — the drag surface (ProjectSprintsPage) has
 * no form, same reasoning as useMoveIssue. onMutate/onError give the
 * backlog/active-sprint drag its own optimistic update, same mechanism
 * as useMoveIssue against the board cache: snapshot, apply the
 * optimistic move, restore on error. Scoped to the backlog query only.
 */
export function useAssignIssueSprint(organizationId: string, projectId: string) {
  const queryClient = useQueryClient();

  return useMutation<unknown, unknown, AssignVariables, AssignContext>({
    mutationFn: ({ issueId, ...input }) => assignIssueSprint(organizationId, projectId, issueId, input),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: issueKeys.backlog(projectId) });
      const previousBacklog = queryClient.getQueryData<GetBacklogResponse>(issueKeys.backlog(projectId));

      if (previousBacklog) {
        const dragged =
          previousBacklog.backlog.find((issue) => issue.id === variables.issueId) ??
          previousBacklog.activeSprintIssues.find((issue) => issue.id === variables.issueId);

        if (dragged) {
          const moved = { ...dragged, sprintId: variables.sprintId };
          const backlog = previousBacklog.backlog.filter((issue) => issue.id !== variables.issueId);
          const activeSprintIssues = previousBacklog.activeSprintIssues.filter(
            (issue) => issue.id !== variables.issueId,
          );
          // Placed where the drop said (before nextIssueId), else at the end of the target list, as the server does.
          const insertInto = (list: GetBacklogResponse["backlog"]) => {
            const at = variables.nextIssueId ? list.findIndex((issue) => issue.id === variables.nextIssueId) : -1;
            return at === -1 ? [...list, moved] : [...list.slice(0, at), moved, ...list.slice(at)];
          };
          const optimistic: GetBacklogResponse = variables.sprintId
            ? { ...previousBacklog, backlog, activeSprintIssues: insertInto(activeSprintIssues) }
            : { ...previousBacklog, backlog: insertInto(backlog), activeSprintIssues };
          queryClient.setQueryData(issueKeys.backlog(projectId), optimistic);
        }
      }

      return { previousBacklog };
    },
    onError: (error, variables, context) => {
      if (context?.previousBacklog) {
        queryClient.setQueryData(issueKeys.backlog(projectId), context.previousBacklog);
      }
      if (error instanceof ApiError && error.code === "version_conflict") {
        void queryClient.invalidateQueries({ queryKey: issueKeys.list(projectId) });
        void queryClient.invalidateQueries({ queryKey: issueKeys.detail(variables.issueId) });
      }
    },
    onSuccess: (_data, variables) => {
      // The server computed the real order and bumped the issue's version: refetch both lists, so the next
      // drag of the same card does not send a stale version.
      void queryClient.invalidateQueries({ queryKey: issueKeys.backlog(projectId) });
      void queryClient.invalidateQueries({ queryKey: issueKeys.list(projectId) });
      void queryClient.invalidateQueries({ queryKey: issueKeys.detail(variables.issueId) });
      void queryClient.invalidateQueries({ queryKey: issueKeys.events(variables.issueId) });
    },
  });
}
