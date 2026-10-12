import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import {
  requestPasswordResetRequestSchema,
  type RequestPasswordResetRequest,
} from "@flowdesc/contracts";
import { Button, ErrorText, Field, Input } from "../../../shared/ui";
import { requestPasswordReset } from "../api/requestPasswordReset";

/**
 * Always shows the same success message once submitted, whether or not
 * the email actually has an account — the API responds identically
 * either way (see apps/api's auth.service.ts, requestPasswordReset), so
 * showing anything else here would leak exactly what that design is
 * meant to hide.
 */
export function RequestPasswordResetForm() {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RequestPasswordResetRequest>({
    resolver: zodResolver(requestPasswordResetRequestSchema),
  });

  const mutation = useMutation({ mutationFn: requestPasswordReset });

  if (mutation.isSuccess) {
    return (
      <p className="text-sm">
        If that email has an account, a reset link is on its way.
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit((data) => mutation.mutate(data))}
      className="flex flex-col gap-4"
    >
      <Field label="Email" error={errors.email?.message}>
        <Input type="email" {...register("email")} autoComplete="email" aria-invalid={errors.email ? true : undefined} className="w-full" />
      </Field>

      {mutation.isError && <ErrorText>{mutation.error.message}</ErrorText>}

      <Button type="submit" variant="create" fullWidth pending={mutation.isPending}>
        {mutation.isPending ? "Sending…" : "Send reset link"}
      </Button>
    </form>
  );
}
