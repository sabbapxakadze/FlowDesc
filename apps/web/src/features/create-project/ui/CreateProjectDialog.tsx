import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createProjectRequestSchema, type CreateProjectRequest } from "@flowdesc/contracts";
import { projectKeys } from "../../../entities/project";
import { Button, Dialog, ErrorText, Field, Input } from "../../../shared/ui";
import { createProject } from "../api/createProject";

/**
 * The "New project" popup: a name and a key (2 to 10 letters or digits, uppercased by the server; it is part of every issue key, so it cannot be changed
 * later). A click on the dimmed area closes it unless something is typed; Esc, the X and Cancel always close it. Mount it only while it should be open.
 * Gated server-side by requirePermission("manage_project"), Owner/Admin only: a 403 shows under the form.
 */
export function CreateProjectDialog({ organizationId, onClose }: { organizationId: string; onClose: () => void }) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<CreateProjectRequest>({ resolver: zodResolver(createProjectRequestSchema) });

  const mutation = useMutation({
    mutationFn: (data: CreateProjectRequest) => createProject(organizationId, data),
    onSuccess: () => {
      // The list, and the cards' numbers under it (projectKeys.summaries sits below list).
      void queryClient.invalidateQueries({ queryKey: projectKeys.list(organizationId) });
      onClose();
    },
  });

  return (
    <Dialog title="New project" onClose={onClose} dismissOnBackdrop={!isDirty}>
      <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="flex flex-col gap-3">
        <Field label="Name" error={errors.name?.message}>
          <Input data-autofocus {...register("name")} placeholder="Website" />
        </Field>
        <Field label="Key" error={errors.key?.message}>
          <Input {...register("key")} placeholder="WEB" className="w-28 uppercase" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="success" pending={mutation.isPending}>
            {mutation.isPending ? "Adding…" : "Add project"}
          </Button>
        </div>
        {mutation.isError && <ErrorText>{mutation.error.message}</ErrorText>}
      </form>
    </Dialog>
  );
}
