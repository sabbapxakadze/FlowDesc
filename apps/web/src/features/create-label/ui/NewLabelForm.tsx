import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createLabelRequestSchema, type CreateLabelRequest } from "@flowdesc/contracts";
import { LabelBadge, LabelColorPicker, labelKeys } from "../../../entities/label";
import { Button, ErrorText, Input } from "../../../shared/ui";
import { createLabel } from "../api/createLabel";

/** The colour a new label starts with (the first preset, a teal), so the picker never opens on black. */
const DEFAULT_COLOR = "#0f766e";

/**
 * "New label" on the Labels page: preset colours with the native picker for others, a name, and a live preview of the label as it will look, the same
 * inline shape as editing a label. The colour is always "#rrggbb", which is what the contract accepts. Name rules (1 to 50 characters) are the contract's, checked here before sending and
 * again by the server; a name that already exists in the organization comes back as the server's own 409 message, shown under the form, and the
 * form stays open so it can be changed. Gated server-side by `manage_issue` (Owner, Admin, Member), so the page does not offer it to a viewer.
 */
export function NewLabelForm({ organizationId, onDone }: { organizationId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    setFocus,
    setValue,
    control,
    formState: { errors },
  } = useForm<CreateLabelRequest>({
    resolver: zodResolver(createLabelRequestSchema),
    defaultValues: { name: "", color: DEFAULT_COLOR },
  });
  useEffect(() => setFocus("name"), [setFocus]);
  const color = useWatch({ control, name: "color" });
  const name = useWatch({ control, name: "name" });

  const mutation = useMutation({
    mutationFn: (data: CreateLabelRequest) => createLabel(organizationId, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: labelKeys.list(organizationId) });
      onDone();
    },
  });

  return (
    <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="motion-rise-in flex flex-wrap items-center gap-2" noValidate>
      <LabelColorPicker value={color} onChange={(next) => setValue("color", next, { shouldDirty: true })} />
      <Input {...register("name")} aria-label="Label name" aria-invalid={errors.name ? true : undefined} placeholder="Label name" className="w-56" />
      <span className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
        Preview <LabelBadge label={{ name: name.trim() || "Label name", color }} />
      </span>
      <Button type="submit" size="sm" pending={mutation.isPending} variant="success">
        {mutation.isPending ? "Adding…" : "Add label"}
      </Button>
      <Button type="button" size="sm" variant="secondary" onClick={onDone}>
        Cancel
      </Button>
      {errors.name && <ErrorText className="w-full">{errors.name.message}</ErrorText>}
      {mutation.isError && <ErrorText className="w-full">{mutation.error.message}</ErrorText>}
    </form>
  );
}
