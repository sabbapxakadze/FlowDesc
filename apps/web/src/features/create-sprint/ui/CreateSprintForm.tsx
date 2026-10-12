import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createSprintRequestSchema, type CreateSprintRequest } from "@flowdesk/contracts";
import { sprintKeys } from "../../../entities/sprint";
import { Button, ErrorText, Field, Input } from "../../../shared/ui";
import { createSprint } from "../api/createSprint";

/**
 * The form inside the "New sprint" popup (ADR 0065): a name, and a start and an end date that may both be left empty.
 * Gated server-side by requirePermission("manage_issue") — sprints reuse the issue permissions, no dedicated sprint permission exists
 * (see the Phase 5 slice 4 plan's "Decisions"). The dates are only for the team's reference: nothing starts or completes by itself on a date.
 *
 * startDate/endDate are plain native <input type="date">, registered with setValueAs so an empty field becomes undefined (matching the
 * contract's .optional()) instead of an empty string, which z.iso.date() would reject as an invalid date.
 */
export function CreateSprintForm({
  organizationId,
  projectId,
  onDone,
}: {
  organizationId: string;
  projectId: string;
  /** Called after the sprint is created, and when the person cancels. */
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CreateSprintRequest>({ resolver: zodResolver(createSprintRequestSchema) });

  const mutation = useMutation({
    mutationFn: (data: CreateSprintRequest) => createSprint(organizationId, projectId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: sprintKeys.list(projectId) });
      onDone();
    },
  });

  return (
    <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="flex flex-col gap-3">
      <p className="text-sm text-[var(--color-text-muted)]">
        A sprint is a short, fixed stretch of work. A new one starts as Planned: you start it yourself when the team is ready.
      </p>
      <Field label="Sprint name" error={errors.name?.message}>
        <Input data-autofocus {...register("name")} placeholder="Sprint 1" />
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Start date (optional)" error={errors.startDate?.message}>
          <Input type="date" {...register("startDate", { setValueAs: (v: string) => (v === "" ? undefined : v) })} />
        </Field>
        <Field label="End date (optional)" error={errors.endDate?.message}>
          <Input type="date" {...register("endDate", { setValueAs: (v: string) => (v === "" ? undefined : v) })} />
        </Field>
      </div>
      <p className="-mt-1 text-xs text-[var(--color-text-muted)]">
        Dates are only for your reference. A sprint never starts or ends on its own: you start it and you complete it.
      </p>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="success" pending={mutation.isPending}>
          {mutation.isPending ? "Creating…" : "Create sprint"}
        </Button>
      </div>
      {mutation.isError && <ErrorText>{mutation.error.message}</ErrorText>}
    </form>
  );
}
