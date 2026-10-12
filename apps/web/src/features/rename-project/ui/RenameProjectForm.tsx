import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  updateProjectRequestSchema,
  type Project,
  type UpdateProjectRequest,
} from "@flowdesc/contracts";
import { projectKeys } from "../../../entities/project";
import { Button, ErrorText, Field, Input, useSuccessFlash } from "../../../shared/ui";
import { updateProject } from "../api/updateProject";

/**
 * Only the name. The key stays read-only on the page that hosts this form:
 * it is part of every issue key people already have in links and heads.
 * The API enforces manage_project (owner/admin); this form does not hide
 * itself, the page decides whether to render it.
 */
export function RenameProjectForm({
  organizationId,
  project,
}: {
  organizationId: string;
  project: Project;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<UpdateProjectRequest>({
    resolver: zodResolver(updateProjectRequestSchema),
    defaultValues: { name: project.name },
  });

  const mutation = useMutation({
    mutationFn: (data: UpdateProjectRequest) =>
      updateProject(organizationId, project.id, data),
    onSuccess: (updated) => {
      // The sidebar, the page titles and every eyebrow read this list.
      void queryClient.invalidateQueries({ queryKey: projectKeys.list(organizationId) });
      reset({ name: updated.name });
    },
  });
  const saved = useSuccessFlash(mutation.isSuccess);

  return (
    <form
      onSubmit={handleSubmit((data) => mutation.mutate(data))}
      className="flex flex-col gap-3"
    >
      <Field label="Project name" error={errors.name?.message}>
        <Input {...register("name")} className="w-full max-w-md" />
      </Field>
      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" variant="success" pending={mutation.isPending} done={saved} disabled={!isDirty}>
          {mutation.isPending ? "Saving…" : "Save"}
        </Button>
        {mutation.isSuccess && !isDirty && (
          <span role="status" className="text-sm text-[var(--color-text-muted)]">
            Saved
          </span>
        )}
      </div>
      {mutation.isError && <ErrorText>{mutation.error.message}</ErrorText>}
    </form>
  );
}
