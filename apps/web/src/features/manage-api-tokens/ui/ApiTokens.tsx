import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createApiTokenRequestSchema,
  createApiTokenResponseSchema,
  type CreateApiTokenRequest,
} from "@flowdesc/contracts";
import { apiTokenKeys, useApiTokens, useRevokeApiToken, type ApiToken } from "../../../entities/api-token";
import { apiPost, ApiError } from "../../../shared/api/client";
import { useAuth } from "../../../shared/auth/useAuth";
import { useTimezone } from "../../../shared/lib/timezone";
import { Button, ConfirmDelete, EmptyState, ErrorText, Field, Input, SegmentedControl, Skeleton, Time } from "../../../shared/ui";

type Lifetime = "30" | "90" | "365";
const LIFETIMES: readonly { value: Lifetime; label: string }[] = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
];

/** Active, revoked or past its date. Kept out of the component so reading the clock is not part of rendering. */
function stateOf(token: ApiToken): "active" | "revoked" | "expired" {
  if (token.revokedAt) return "revoked";
  return new Date(token.expiresAt).getTime() <= Date.now() ? "expired" : "active";
}

/**
 * Personal access tokens (ADR 0070): a long secret a person gives to an AI app so it can read their FlowDesc data as them, read-only
 * for now. The secret is shown once, right after it is made, and lives only in this component's mutation result: it is never put in
 * the list's cache or in storage, so leaving the page loses it (the server keeps only a hash and could not show it again anyway).
 * A demo copy has no tokens (the server refuses them), so it gets a note instead of a form.
 */
export function ApiTokens() {
  const { organization } = useAuth();
  const inDemo = Boolean(organization?.demoExpiresAt);
  if (inDemo) {
    return <p className="text-sm text-[var(--color-text-muted)]">Access tokens are not available in the demo. Create an account to use them.</p>;
  }
  return <TokensPanel />;
}

function TokensPanel() {
  const queryClient = useQueryClient();
  const tokens = useApiTokens();
  const [lifetime, setLifetime] = useState<Lifetime>("90");
  const [copied, setCopied] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<CreateApiTokenRequest>({
    resolver: zodResolver(createApiTokenRequestSchema),
    defaultValues: { name: "", scope: "read", expiresInDays: 90 },
  });

  const create = useMutation({
    mutationFn: (data: CreateApiTokenRequest) => apiPost("/v1/users/me/api-tokens", data, createApiTokenResponseSchema),
    onSuccess: () => {
      reset();
      setCopied(false);
      void queryClient.invalidateQueries({ queryKey: apiTokenKeys.list });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.details) {
        for (const [field, messages] of Object.entries(err.details)) {
          setError(field as keyof CreateApiTokenRequest, { message: messages[0] });
        }
      }
    },
  });
  const createError = create.isError && !(create.error instanceof ApiError && create.error.details);

  const created = create.data;

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-[var(--color-text-muted)]">
        A token lets an AI app (for example through the FlowDesc MCP server, coming next) read your projects and issues as you. Treat it like a
        password. It can only read for now: it can never change anything, and it cannot manage your account.
      </p>

      {created ? (
        <div role="status" className="rounded-[var(--radius-card)] bg-[var(--color-bg-surface)] p-4 shadow-sm">
          <p className="text-sm">
            Token <strong>{created.data.name}</strong> created. <strong>This is the only time you will see it.</strong> Copy it now and paste it
            into the app that will use it.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Input readOnly aria-label="New access token" value={created.token} className="min-w-0 flex-1" onFocus={(e) => e.currentTarget.select()} />
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                void navigator.clipboard.writeText(created.token).then(() => setCopied(true));
              }}
            >
              {copied ? "Copied" : "Copy token"}
            </Button>
            <Button type="button" variant="link" onClick={() => create.reset()}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit((data) => create.mutate({ ...data, expiresInDays: Number(lifetime) as CreateApiTokenRequest["expiresInDays"] }))}
          className="flex max-w-md flex-col gap-3"
        >
          <Field label="Token name" error={errors.name?.message}>
            <Input placeholder="Claude on my laptop" autoComplete="off" {...register("name")} aria-invalid={errors.name ? true : undefined} />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-sm font-medium">Expires in</span>
            <SegmentedControl label="Expires in" value={lifetime} onChange={setLifetime} options={LIFETIMES} />
          </div>
          {createError && <ErrorText>{create.error.message}</ErrorText>}
          <div>
            <Button type="submit" variant="create" pending={create.isPending}>
              {create.isPending ? "Creating…" : "Create token"}
            </Button>
          </div>
        </form>
      )}

      <div>
        <h3 className="mb-2 text-sm font-medium">Your tokens</h3>
        {tokens.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : tokens.isError ? (
          <ErrorText>Could not load your tokens: {tokens.error.message}</ErrorText>
        ) : tokens.data.length === 0 ? (
          <EmptyState block>No tokens yet.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-2">
            {tokens.data.map((token) => (
              <TokenRow key={token.id} token={token} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const STATE_LABEL = { active: "Active", revoked: "Revoked", expired: "Expired" } as const;

function TokenRow({ token }: { token: ApiToken }) {
  const timeZone = useTimezone();
  const revoke = useRevokeApiToken();
  const state = stateOf(token);
  const expires = new Date(token.expiresAt).toLocaleDateString(undefined, { dateStyle: "medium", ...(timeZone ? { timeZone } : {}) });
  return (
    <li
      aria-label={token.name}
      className={`rounded-[var(--radius-card)] border border-[var(--color-border-default)] bg-[var(--color-bg-surface)] p-3 text-sm ${state === "active" ? "" : "opacity-70"}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{token.name}</p>
          <p className="text-xs text-[var(--color-text-muted)]">
            Read-only · created <Time iso={token.createdAt} /> ·{" "}
            {token.lastUsedAt ? (
              <>
                last used <Time iso={token.lastUsedAt} />
              </>
            ) : (
              "never used"
            )}{" "}
            · {state === "expired" ? "expired" : "expires"} {expires}
          </p>
        </div>
        <span className="rounded-lg border border-[var(--color-border-default)] px-2 py-0.5 text-xs font-medium">{STATE_LABEL[state]}</span>
      </div>
      {state === "active" && (
        <div className="mt-2">
          <ConfirmDelete
            label="Revoke"
            message="Apps using this token stop working at once. This cannot be undone."
            confirmLabel="Yes, revoke it"
            onConfirm={() => revoke.mutate(token.id)}
            isPending={revoke.isPending}
            error={revoke.isError ? revoke.error.message : null}
          />
        </div>
      )}
    </li>
  );
}
