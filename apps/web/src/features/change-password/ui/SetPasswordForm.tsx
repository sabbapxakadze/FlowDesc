import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { setPasswordRequestSchema } from "@flowdesc/contracts";
import { accountKeys } from "../../../entities/account";
import { apiPost, ApiError } from "../../../shared/api/client";
import { useAuth } from "../../../shared/auth/useAuth";
import { Button, ErrorText, Field, PasswordInput } from "../../../shared/ui";

const formSchema = setPasswordRequestSchema
  .extend({ repeat: z.string().min(1, "Repeat the password") })
  .refine((v) => v.newPassword === v.repeat, { path: ["repeat"], message: "The two passwords do not match" });
type FormValues = z.infer<typeof formSchema>;

/**
 * The first password of an account made with Google/GitHub (ADR 0042). There is no "current password" to ask for: being
 * signed in is the proof. Like a password change, it signs the other devices out. Afterwards the account has a password,
 * so the Password section shows "Change password" instead (the account query is refreshed).
 */
export function SetPasswordForm() {
  const { logout } = useAuth();
  const queryClient = useQueryClient();
  const [done, setDone] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: { newPassword: "", repeat: "" } });

  const mutation = useMutation({
    mutationFn: ({ newPassword }: FormValues) => apiPost("/v1/auth/set-password", { newPassword }, z.object({ keptThisSession: z.boolean() })),
    onSuccess: ({ keptThisSession }) => {
      if (!keptThisSession) {
        logout();
        return;
      }
      setDone(true);
      void queryClient.invalidateQueries({ queryKey: accountKeys.me });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.details) {
        for (const [field, messages] of Object.entries(err.details)) setError(field as keyof FormValues, { message: messages[0] });
      }
    },
  });

  return (
    <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="flex max-w-md flex-col gap-3">
      <Field label="New password" error={errors.newPassword?.message}>
        <PasswordInput autoComplete="new-password" {...register("newPassword")} aria-invalid={errors.newPassword ? true : undefined} />
      </Field>
      <Field label="Repeat the password" error={errors.repeat?.message}>
        <PasswordInput autoComplete="new-password" {...register("repeat")} aria-invalid={errors.repeat ? true : undefined} />
      </Field>
      {mutation.isError && !(mutation.error instanceof ApiError && mutation.error.details) && <ErrorText>{mutation.error.message}</ErrorText>}
      {done && (
        <p role="status" className="text-sm">
          Password added. Other devices were signed out.
        </p>
      )}
      <div>
        <Button type="submit" variant="success" pending={mutation.isPending}>
          {mutation.isPending ? "Saving…" : "Add password"}
        </Button>
      </div>
    </form>
  );
}
