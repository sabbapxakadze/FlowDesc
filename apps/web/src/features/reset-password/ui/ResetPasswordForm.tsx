import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import {
  confirmPasswordResetRequestSchema,
  type ConfirmPasswordResetRequest,
} from "@flowdesc/contracts";
import { Button, ErrorText, Field, PasswordInput } from "../../../shared/ui";
import { resetPassword } from "../api/resetPassword";

/**
 * No auto-login on success — confirmPasswordReset revokes every existing
 * session on the API side (see apps/api's auth.service.ts), so there's no
 * session left to resume even if this page tried. Straight to /login with
 * the new password.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const navigate = useNavigate();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ConfirmPasswordResetRequest>({
    resolver: zodResolver(confirmPasswordResetRequestSchema),
    defaultValues: { token },
  });

  const mutation = useMutation({
    mutationFn: resetPassword,
    onSuccess: () => void navigate("/login"),
  });

  return (
    <form
      onSubmit={handleSubmit((data) => mutation.mutate(data))}
      className="flex flex-col gap-4"
    >
      <input type="hidden" {...register("token")} />

      <Field label="New password" error={errors.newPassword?.message}>
        <PasswordInput {...register("newPassword")} autoComplete="new-password" aria-invalid={errors.newPassword ? true : undefined} className="w-full" />
      </Field>

      {mutation.isError && <ErrorText>{mutation.error.message}</ErrorText>}

      <Button type="submit" variant="create" fullWidth pending={mutation.isPending}>
        {mutation.isPending ? "Resetting…" : "Reset password"}
      </Button>
    </form>
  );
}
