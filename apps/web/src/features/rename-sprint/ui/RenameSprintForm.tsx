import { useForm } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Sprint } from "@flowdesk/contracts";
import { issueKeys } from "../../../entities/issue";
import { sprintKeys } from "../../../entities/sprint";
import { ApiError } from "../../../shared/api/client";
import { Button, ErrorText, Input } from "../../../shared/ui";
import { renameSprint } from "../api/renameSprint";

type FormValues = { name: string };

/**
 * Inline rename for one sprint row. The version the row was loaded with goes
 * along (a sprint is version-checked, like start and complete). On a 409 the
 * list is refetched and the form closes, same "show the real state, no merge"
 * answer the issue edit form gives.
 */
export function RenameSprintForm({
  organizationId,
  projectId,
  sprint,
  onDone,
  inputClassName = "w-56",
}: {
  organizationId: string;
  projectId: string;
  sprint: Sprint;
  onDone: () => void;
  /** The input's width classes; the default suits a wide row. */
  inputClassName?: string;
}) {
  const queryClient = useQueryClient();
  const { register, handleSubmit } = useForm<FormValues>({
    defaultValues: { name: sprint.name },
  });

  const mutation = useMutation({
    mutationFn: (data: FormValues) =>
      renameSprint(organizationId, projectId, sprint.id, {
        version: sprint.version,
        name: data.name,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sprintKeys.list(projectId) });
      // The backlog view shows the active sprint's name.
      void queryClient.invalidateQueries({ queryKey: issueKeys.backlog(projectId) });
      onDone();
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "version_conflict") {
        void queryClient.invalidateQueries({ queryKey: sprintKeys.list(projectId) });
        onDone();
      }
    },
  });

  const showError =
    mutation.isError &&
    !(mutation.error instanceof ApiError && mutation.error.code === "version_conflict");

  return (
    <form
      onSubmit={handleSubmit((data) =>
        data.name.trim() === sprint.name ? onDone() : mutation.mutate(data),
      )}
      className="motion-rise-in flex flex-wrap items-center gap-2"
    >
      <Input
        {...register("name", { required: true })}
        aria-label="Sprint name"
        className={inputClassName}
      />
      <Button type="submit" size="sm" variant="success" pending={mutation.isPending}>
        {mutation.isPending ? "Saving…" : "Save"}
      </Button>
      <Button type="button" size="sm" variant="secondary" onClick={onDone}>
        Cancel
      </Button>
      {showError && <ErrorText>{mutation.error?.message}</ErrorText>}
    </form>
  );
}
