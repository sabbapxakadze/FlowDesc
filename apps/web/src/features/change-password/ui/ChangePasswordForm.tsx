import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { changePasswordRequestSchema } from "@flowdesc/contracts";
import { useAccount } from "../../../entities/account";
import { apiPost, ApiError } from "../../../shared/api/client";
import { useAuth } from "../../../shared/auth/useAuth";
import { Button, ErrorText, Field, PasswordInput } from "../../../shared/ui";
import { ResetByEmailDialog } from "./ResetByEmailDialog";

// The request schema plus "type it twice": the repeat never leaves the browser.
const formSchema = changePasswordRequestSchema
  .extend({ repeat: z.string().min(1, "Repeat the new password") })
  .refine((v) => v.newPassword === v.repeat, { path: ["repeat"], message: "The two new passwords do not match" });
type FormValues = z.infer<typeof formSchema>;

/**
 * Change the password while logged in: the CURRENT password is required, the new one is typed twice. On success the
 * server signs every OTHER session out and keeps this one (and emails a notice); if it could not tell which session
 * is this one, everything ends and the person is sent to the login page.
 */
export function ChangePasswordForm() {
  const { logout } = useAuth();
  const account = useAccount();
  const [done, setDone] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { currentPassword: "", newPassword: "", repeat: "" } });

  const mutation = useMutation({
    mutationFn: ({ currentPassword, newPassword }: FormValues) =>
      apiPost("/v1/auth/change-password", { currentPassword, newPassword }, z.object({ keptThisSession: z.boolean() })),
    onSuccess: ({ keptThisSession }) => {
      if (!keptThisSession) {
        logout();
        return;
      }
      reset();
      setDone(true);
    },
    onError: (err) => {
      setDone(false);
      if (err instanceof ApiError && err.details) {
        for (const [field, messages] of Object.entries(err.details)) {
          setError(field as keyof FormValues, { message: messages[0] });
        }
      }
    },
  });

  return (
    <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="flex max-w-md flex-col gap-3">
      <Field label="Current password" error={errors.currentPassword?.message}>
        <PasswordInput autoComplete="current-password" {...register("currentPassword")} aria-invalid={errors.currentPassword ? true : undefined} />
      </Field>
      <Field label="New password" error={errors.newPassword?.message}>
        <PasswordInput autoComplete="new-password" {...register("newPassword")} aria-invalid={errors.newPassword ? true : undefined} />
      </Field>
      <Field label="Repeat the new password" error={errors.repeat?.message}>
        <PasswordInput autoComplete="new-password" {...register("repeat")} aria-invalid={errors.repeat ? true : undefined} />
      </Field>
      {mutation.isError && !(mutation.error instanceof ApiError && mutation.error.details) && <ErrorText>{mutation.error.message}</ErrorText>}
      {done && (
        <p role="status" className="text-sm text-[var(--color-text-default)]">
          Password changed. Other devices were signed out, and we sent you an email about it.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="success" pending={mutation.isPending}>
          {mutation.isPending ? "Changing…" : "Change password"}
        </Button>
        <Button type="button" variant="link" disabled={!account.data} onClick={() => setResetOpen(true)}>
          Forgot it? Reset by email
        </Button>
      </div>
      {resetOpen && account.data && <ResetByEmailDialog email={account.data.email} onClose={() => setResetOpen(false)} />}
    </form>
  );
}
