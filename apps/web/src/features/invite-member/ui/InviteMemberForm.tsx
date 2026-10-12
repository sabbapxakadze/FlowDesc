import { useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createInvitationRequestSchema, type CreateInvitationRequest } from "@flowdesc/contracts";
import { invitationKeys } from "../../../entities/invitation";
import { ApiError } from "../../../shared/api/client";
import { Button, Dropdown, ErrorText, Field, Input } from "../../../shared/ui";
import { createInvitation } from "../api/createInvitation";

const ROLE_HELP: Record<CreateInvitationRequest["role"], string> = {
  admin: "Can manage projects and invite people, and do everything a member can.",
  member: "Can create and edit issues, comment and upload files.",
  viewer: "Can read everything but change nothing.",
};

/**
 * Owners and admins only (the page decides who sees it; the API refuses anyone
 * else). After a successful invite the link is shown ONCE with a Copy button: the
 * server keeps only a hash of the token, so it cannot show the link again, and the
 * email may not arrive (a mistyped address, spam, a provider hiccup). Sharing the
 * link by hand always works.
 */
export function InviteMemberForm({ organizationId }: { organizationId: string }) {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    control,
    setError,
    formState: { errors },
  } = useForm<CreateInvitationRequest>({
    resolver: zodResolver(createInvitationRequestSchema),
    defaultValues: { email: "", role: "member" },
  });

  const mutation = useMutation({
    mutationFn: (data: CreateInvitationRequest) => createInvitation(organizationId, data),
    onSuccess: () => {
      setCopied(false);
      void queryClient.invalidateQueries({ queryKey: invitationKeys.list(organizationId) });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.details) {
        for (const [field, messages] of Object.entries(err.details)) {
          setError(field as keyof CreateInvitationRequest, { message: messages[0] });
        }
      }
    },
  });

  const role = useWatch({ control, name: "role" });

  if (mutation.isSuccess) {
    const { data, inviteUrl } = mutation.data;
    return (
      <div className="mb-6 rounded-[var(--radius-card)] bg-[var(--color-bg-surface)] p-4 shadow-sm">
        <p className="text-sm">
          Invitation created for <strong>{data.email}</strong> as {data.role}. We emailed them the link.
          If it does not arrive, send them this one yourself. It is shown only now and works once.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input readOnly aria-label="Invitation link" value={inviteUrl} className="min-w-0 flex-1" onFocus={(e) => e.currentTarget.select()} />
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              void navigator.clipboard.writeText(inviteUrl).then(() => setCopied(true));
            }}
          >
            {copied ? "Copied" : "Copy link"}
          </Button>
          <Button
            type="button"
            variant="link"
            onClick={() => {
              mutation.reset();
              reset();
            }}
          >
            Invite someone else
          </Button>
        </div>
      </div>
    );
  }

  const showGeneralError =
    mutation.isError && !(mutation.error instanceof ApiError && mutation.error.details);

  return (
    <form
      onSubmit={handleSubmit((data) => mutation.mutate(data))}
      className="mb-6 flex flex-wrap items-start gap-3 rounded-[var(--radius-card)] bg-[var(--color-bg-surface)] p-4 shadow-sm"
    >
      <Field label="Email" error={errors.email?.message} className="min-w-56 flex-1">
        <Input type="email" {...register("email")} placeholder="colleague@example.com" autoComplete="off" aria-invalid={errors.email ? true : undefined} />
      </Field>

      <Field label="Role" error={errors.role?.message}>
        <Controller
          control={control}
          name="role"
          render={({ field }) => (
            <Dropdown
              value={field.value}
              onChange={field.onChange}
              options={[
                { value: "member", label: "Member" },
                { value: "admin", label: "Admin" },
                { value: "viewer", label: "Viewer" },
              ]}
            />
          )}
        />
      </Field>

      <Button type="submit" className="mt-6" pending={mutation.isPending}>
        {mutation.isPending ? "Inviting…" : "Send invitation"}
      </Button>

      <p className="w-full text-xs text-[var(--color-text-muted)]">{ROLE_HELP[role]}</p>
      {showGeneralError && <ErrorText className="w-full">{mutation.error?.message}</ErrorText>}
    </form>
  );
}
