import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Project } from "@flowdesc/contracts";
import { projectKeys } from "../../../entities/project";
import { Button, ErrorText, Field, Input } from "../../../shared/ui";
import { deleteProject } from "../api/deleteProject";

/**
 * The most destructive action in the app (ADR 0022): every issue, comment, file,
 * sprint and the history under the project is permanently removed. So it is two
 * steps, and the second needs the project's exact name typed in; the API checks
 * the same name again, so this is a convenience, not the only guard. The page
 * decides whether to show it (owner or admin); the API refuses anyone else.
 */
export function DeleteProjectForm({
  organizationId,
  project,
  onDeleted,
}: {
  organizationId: string;
  project: Project;
  onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const [asking, setAsking] = useState(false);
  const [typed, setTyped] = useState("");

  const mutation = useMutation({
    mutationFn: () => deleteProject(organizationId, project.id, typed),
    onSuccess: () => {
      // The sidebar and the projects list; everything keyed under this project is
      // now meaningless, so drop it instead of refetching (that would be 404s).
      queryClient.removeQueries({ queryKey: [...projectKeys.all, project.id] });
      void queryClient.invalidateQueries({ queryKey: projectKeys.list(organizationId) });
      onDeleted();
    },
  });

  if (!asking) {
    return (
      <Button type="button" variant="danger" size="sm" onClick={() => setAsking(true)}>
        Delete project
      </Button>
    );
  }

  return (
    <form
      role="alertdialog"
      aria-label="Delete project"
      onSubmit={(e) => {
        e.preventDefault();
        if (typed === project.name) mutation.mutate();
      }}
      className="flex max-w-md flex-col gap-3"
    >
      <p className="text-sm">
        This permanently deletes <strong>{project.name}</strong> with all of its issues,
        comments, files, sprints and history. It cannot be undone.
      </p>
      <Field label={`Type "${project.name}" to confirm`}>
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          aria-label="Confirm project name"
        />
      </Field>
      <div className="flex gap-2">
        <Button
          type="submit"
          size="sm"
          variant="dangerStrong"
          disabled={typed !== project.name || mutation.isPending}
        >
          {mutation.isPending ? "Deleting…" : "Delete this project"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={mutation.isPending}
          onClick={() => {
            setAsking(false);
            setTyped("");
          }}
        >
          Cancel
        </Button>
      </div>
      {mutation.isError && <ErrorText>{mutation.error.message}</ErrorText>}
    </form>
  );
}
