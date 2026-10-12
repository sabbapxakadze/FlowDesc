import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { requestEmailChangeRequestSchema, type RequestEmailChangeRequest } from "@flowdesc/contracts";
import { accountKeys } from "../../../entities/account";
import { apiPost, ApiError } from "../../../shared/api/client";
import { Button, ErrorText, Field, Input, PasswordInput } from "../../../shared/ui";

/**
 * Step one of changing the email: the new address and the current password. A confirmation link goes to the NEW
 * address (and a notice to the old one); the email only changes when that link is opened.
 */
export function ChangeEmailForm() {
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<RequestEmailChangeRequest>({
    resolver: zodResolver(requestEmailChangeRequestSchema),
    defaultValues: { newEmail: "", password: "" },
  });

  const mutation = useMutation({
    mutationFn: (data: RequestEmailChangeRequest) => apiPost("/v1/auth/email-change/request", data, z.object({ pendingEmail: z.string() })),
    onSuccess: () => {
      reset();
      void queryClient.invalidateQueries({ queryKey: accountKeys.me });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.details) {
        for (const [field, messages] of Object.entries(err.details)) {
          setError(field as keyof RequestEmailChangeRequest, { message: messages[0] });
        }
      } else if (err instanceof ApiError && err.code === "email_already_registered") {
        setError("newEmail", { message: "An account with this email already exists." });
      }
    },
  });
  const generalError =
    mutation.isError && !(mutation.error instanceof ApiError && (mutation.error.details || mutation.error.code === "email_already_registered"));

  return (
    <form onSubmit={handleSubmit((data) => mutation.mutate(data))} className="flex max-w-md flex-col gap-3">
      <Field label="New email" error={errors.newEmail?.message}>
        <Input type="email" autoComplete="email" {...register("newEmail")} aria-invalid={errors.newEmail ? true : undefined} />
      </Field>
      <Field label="Your password" error={errors.password?.message}>
        <PasswordInput autoComplete="current-password" {...register("password")} aria-invalid={errors.password ? true : undefined} />
      </Field>
      {generalError && <ErrorText>{mutation.error.message}</ErrorText>}
      {mutation.isSuccess && (
        <p role="status" className="text-sm">
          We sent a confirmation link to <strong>{mutation.data.pendingEmail}</strong>. Your email changes when you open it.
        </p>
      )}
      <div>
        <Button type="submit" variant="success" pending={mutation.isPending}>
          {mutation.isPending ? "Sending…" : "Send confirmation link"}
        </Button>
      </div>
    </form>
  );
}
