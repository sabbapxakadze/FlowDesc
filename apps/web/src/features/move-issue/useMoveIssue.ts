import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Issue, MoveIssueRequest } from "@flowdesc/contracts";
import { issueKeys } from "../../entities/issue";
import { ApiError } from "../../shared/api/client";
import { moveIssue } from "./api/moveIssue";

type MoveVariables = { issueId: string } & MoveIssueRequest;
type MoveContext = { previousBoard: Issue[] | undefined };

/**
 * A hook, not a form component's inline useMutation (unlike edit-issue/
 * create-issue) — those center on one form, so their mutation lives
 * inline in it. Move has no form: the whole board's drag interactions
 * (Phase 5 slice 3) need the same mutation, so ProjectBoardPage calls
 * this once. See the Phase 5 slice 2 plan's "Decisions" section for why
 * this is a hook at all.
 *
 * onMutate/onError give the board its first optimistic update: the
 * dragged card moves in the cache immediately, before the server
 * responds, and snaps back on failure. Reuses TanStack Query's own
 * optimistic-update mechanism (snapshot the cache, apply the optimistic
 * value, restore on error) rather than a separate local-state layer in
 * ProjectBoardPage — this project already leans on TanStack Query as
 * the data layer, so this is less machinery, not more. Scoped to the
 * board query only (issueKeys.board) — the paginated list view has no
 * drag interaction to give instant feedback for, so it just keeps
 * refetching normally on settle, same as slice 2. board_rank itself is
 * never part of this: the optimistic reorder only ever splices by id
 * and sets status, matching what the client is allowed to know per ADR
 * 0007 (rank is a server-only implementation detail).
 */
export function useMoveIssue(organizationId: string, projectId: string) {
  const queryClient = useQueryClient();

  return useMutation<Issue, unknown, MoveVariables, MoveContext>({
    mutationFn: ({ issueId, ...input }) => moveIssue(organizationId, projectId, issueId, input),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: issueKeys.board(projectId) });
      const previousBoard = queryClient.getQueryData<Issue[]>(issueKeys.board(projectId));

      if (previousBoard) {
        const dragged = previousBoard.find((issue) => issue.id === variables.issueId);
        if (dragged) {
          const rest = previousBoard.filter((issue) => issue.id !== variables.issueId);
          const moved: Issue = { ...dragged, status: variables.status };
          const insertIndex = variables.nextIssueId
            ? rest.findIndex((issue) => issue.id === variables.nextIssueId)
            : -1;
          const optimisticBoard =
            insertIndex === -1
              ? [...rest, moved]
              : [...rest.slice(0, insertIndex), moved, ...rest.slice(insertIndex)];
          queryClient.setQueryData(issueKeys.board(projectId), optimisticBoard);
        }
      }

      return { previousBoard };
    },
    onError: (error, variables, context) => {
      if (context?.previousBoard) {
        queryClient.setQueryData(issueKeys.board(projectId), context.previousBoard);
      }
      if (error instanceof ApiError && error.code === "version_conflict") {
        void queryClient.invalidateQueries({ queryKey: issueKeys.list(projectId) });
        void queryClient.invalidateQueries({ queryKey: issueKeys.detail(variables.issueId) });
      }
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: issueKeys.list(projectId) });
      void queryClient.invalidateQueries({ queryKey: issueKeys.detail(variables.issueId) });
      void queryClient.invalidateQueries({ queryKey: issueKeys.events(variables.issueId) });
    },
  });
}
