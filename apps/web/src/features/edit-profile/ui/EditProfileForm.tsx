import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import {
  BIO_MAX_LENGTH,
  JOB_TITLE_MAX_LENGTH,
  updateProfileRequestSchema,
  type Profile,
  type UpdateProfileRequest,
} from "@flowdesc/contracts";
import { ApiError } from "../../../shared/api/client";
import { Button, ErrorText, Field, Input, Textarea, useSuccessFlash } from "../../../shared/ui";
import { useUpdateProfile } from "../api/profileMutations";
import { AvatarEditor } from "./AvatarEditor";

type FormValues = UpdateProfileRequest;

/**
 * Edit your own profile (ADR 0028). The form starts from the saved profile; the contract's
 * schema validates it here and on the server, so the limits (name 1-100, title 100, about 300)
 * are written once. Blank title or about are saved as "none". Email is shown, not editable.
 */
export function EditProfileForm({ profile, onSaved }: { profile: Profile; onSaved?: () => void }) {
  const mutation = useUpdateProfile();
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isDirty },
    reset,
  } = useForm<FormValues, unknown, z.output<typeof updateProfileRequestSchema>>({
    resolver: zodResolver(updateProfileRequestSchema),
    defaultValues: { name: profile.name, jobTitle: profile.jobTitle ?? "", bio: profile.bio ?? "" },
  });
  const bio = useWatch({ control, name: "bio" }) ?? "";
  const saved = useSuccessFlash(mutation.isSuccess);

  const onSubmit = handleSubmit((data) =>
    mutation.mutate(data, {
      onSuccess: () => {
        reset({ name: data.name, jobTitle: data.jobTitle ?? "", bio: data.bio ?? "" });
        onSaved?.();
      },
      onError: (err) => {
        if (err instanceof ApiError && err.details) {
          for (const [field, messages] of Object.entries(err.details)) {
            setError(field as keyof FormValues, { message: messages[0] });
          }
        }
      },
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <AvatarEditor name={profile.name} avatarUrl={profile.avatarUrl} />
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field label="Name" error={errors.name?.message}>
          <Input {...register("name")} autoComplete="name" className="w-full" />
        </Field>
        <Field label="Job title (optional)" error={errors.jobTitle?.message}>
          <Input {...register("jobTitle")} maxLength={JOB_TITLE_MAX_LENGTH + 20} className="w-full" />
        </Field>
        <Field label="About you (optional)" error={errors.bio?.message}>
          <Textarea {...register("bio")} rows={4} className="w-full" />
          <span
            className={`self-end text-xs font-normal ${
              bio.length > BIO_MAX_LENGTH ? "text-[var(--color-text-danger)]" : "text-[var(--color-text-muted)]"
            }`}
          >
            {bio.length} / {BIO_MAX_LENGTH}
          </span>
        </Field>
        <Field label="Email">
          <Input value={profile.email} disabled readOnly className="w-full" />
          <span className="text-xs font-normal text-[var(--color-text-muted)]">
            Everyone in your organization can see it. Changing it is not available yet.
          </span>
        </Field>
        {mutation.isError && !(mutation.error instanceof ApiError && mutation.error.details) && (
          <ErrorText>Could not save: {mutation.error.message}</ErrorText>
        )}
        {mutation.isSuccess && !isDirty && (
          <p role="status" className="text-sm text-[var(--color-text-muted)]">
            Saved.
          </p>
        )}
        <div className="flex gap-2">
          <Button type="submit" variant="success" size="sm" pending={mutation.isPending} done={saved} disabled={!isDirty}>
            {mutation.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </div>
  );
}
