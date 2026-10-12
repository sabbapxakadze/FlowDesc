import { useForm, useWatch } from "react-hook-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Label } from "@flowdesc/contracts";
import { issueKeys } from "../../../entities/issue";
import { LabelBadge, LabelColorPicker, labelKeys } from "../../../entities/label";
import { Button, ErrorText, Input } from "../../../shared/ui";
import { updateLabel } from "../api/updateLabel";

type FormValues = { name: string; color: string };

/**
 * Inline edit for one label: preset colours (and the native picker for others), a name box and a live preview. The colour is always
 * "#rrggbb", which is what the contract accepts. Sends only what changed (the API needs at least one field).
 */
export function EditLabelForm({
  organizationId,
  label,
  onDone,
}: {
  organizationId: string;
  label: Label;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const { register, handleSubmit, setValue, control } = useForm<FormValues>({
    defaultValues: { name: label.name, color: label.color.toLowerCase() },
  });

  const color = useWatch({ control, name: "color" });
  const name = useWatch({ control, name: "name" });

  const mutation = useMutation({
    mutationFn: (data: FormValues) =>
      updateLabel(organizationId, label.id, {
        ...(data.name !== label.name ? { name: data.name } : {}),
        ...(data.color.toLowerCase() !== label.color.toLowerCase()
          ? { color: data.color }
          : {}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: labelKeys.list(organizationId) });
      // Labels already attached to issues are cached per issue under issueKeys.all.
      void queryClient.invalidateQueries({ queryKey: issueKeys.all });
      onDone();
    },
  });

  return (
    <form
      onSubmit={handleSubmit((data) => {
        const nothingChanged =
          data.name === label.name &&
          data.color.toLowerCase() === label.color.toLowerCase();
        if (nothingChanged) return onDone();
        mutation.mutate(data);
      })}
      className="motion-rise-in flex flex-wrap items-center gap-2"
    >
      <LabelColorPicker value={color} onChange={(next) => setValue("color", next, { shouldDirty: true })} />
      <Input
        {...register("name", { required: true })}
        aria-label="Label name"
        className="w-56"
      />
      <span className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)]">
        Preview <LabelBadge label={{ name: name.trim() || label.name, color }} />
      </span>
      <Button type="submit" size="sm" pending={mutation.isPending} variant="success">
        {mutation.isPending ? "Saving…" : "Save"}
      </Button>
      <Button type="button" size="sm" variant="secondary" onClick={onDone}>
        Cancel
      </Button>
      {mutation.isError && <ErrorText>{mutation.error.message}</ErrorText>}
    </form>
  );
}
