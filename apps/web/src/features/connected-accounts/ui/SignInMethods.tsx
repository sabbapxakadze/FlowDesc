import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useSearchParams } from "react-router";
import type { Account, OAuthProviderName } from "@flowdesc/contracts";
import { accountKeys } from "../../../entities/account";
import { PROVIDER_LABELS, ProviderIcon, useOAuthProviders, useStartOAuth } from "../../../entities/oauth";
import { apiDeleteVoid } from "../../../shared/api/client";
import { Button, ErrorText, IconButton } from "../../../shared/ui";

/**
 * Which services this account can sign in with (ADR 0042): Connect / Disconnect for each provider the server offers (and
 * any that is connected but no longer offered, so it can still be removed). Disconnecting asks first, in place, and the
 * server refuses to remove the last way to sign in, so the button is replaced by the reason in that case.
 */
export function SignInMethods({ account }: { account: Account }) {
  const providers = useOAuthProviders();
  const connected = new Map(account.connectedAccounts.map((c) => [c.provider, c]));
  const shown = [...new Set<OAuthProviderName>([...(providers.data ?? []), ...connected.keys()])];
  const methods = connected.size + (account.hasPassword ? 1 : 0);

  return (
    <div className="flex flex-col gap-3">
      <ConnectedNotice />
      {shown.length === 0 && <p className="text-sm text-[var(--color-text-muted)]">No other sign-in methods are available.</p>}
      <ul className="flex flex-col divide-y divide-[var(--color-border-default)]">
        {shown.map((provider) => (
          <Row key={provider} provider={provider} email={connected.get(provider)?.email} onlyMethod={methods <= 1} />
        ))}
      </ul>
    </div>
  );
}

/** "Google connected." after coming back from the provider (`?connected=google`); Dismiss removes the parameter. */
function ConnectedNotice() {
  const [params, setParams] = useSearchParams();
  const provider = params.get("connected");
  if (provider !== "google" && provider !== "github") return null;
  return (
    <div role="status" className="flex items-start justify-between gap-3 rounded-[var(--radius-control)] border border-[var(--color-border-default)] px-3 py-2 text-sm">
      <span>{PROVIDER_LABELS[provider]} connected. You can now sign in with it.</span>
      <IconButton
        label="Dismiss"
        className="-my-1 -mr-1"
        onClick={() =>
          setParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              next.delete("connected");
              return next;
            },
            { replace: true },
          )
        }
      >
        <X size={14} aria-hidden="true" />
      </IconButton>
    </div>
  );
}

function Row({ provider, email, onlyMethod }: { provider: OAuthProviderName; email: string | undefined; onlyMethod: boolean }) {
  const name = PROVIDER_LABELS[provider];
  const queryClient = useQueryClient();
  const start = useStartOAuth("link");
  const [asking, setAsking] = useState(false);
  const disconnect = useMutation({
    mutationFn: () => apiDeleteVoid(`/v1/users/me/oauth/${provider}`),
    onSuccess: () => {
      setAsking(false);
      void queryClient.invalidateQueries({ queryKey: accountKeys.me });
    },
  });

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0" data-provider={provider}>
      <ProviderIcon provider={provider} size={20} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-[var(--color-text-muted)]">{email ? `Connected as ${email}` : "Not connected"}</p>
      </div>
      {!email ? (
        <Button type="button" variant="secondary" size="sm" pending={start.isPending} onClick={() => start.mutate(provider)} aria-label={`Connect ${name}`}>
          Connect
        </Button>
      ) : onlyMethod ? (
        <p className="max-w-56 text-xs text-[var(--color-text-muted)]">Your only way to sign in. Add a password to be able to disconnect it.</p>
      ) : !asking ? (
        <Button type="button" variant="secondary" size="sm" onClick={() => setAsking(true)} aria-label={`Disconnect ${name}`}>
          Disconnect
        </Button>
      ) : (
        <div role="alertdialog" aria-label={`Disconnect ${name}`} className="motion-rise-in flex basis-full flex-col gap-2">
          <p className="text-sm">You will no longer be able to sign in with {name}. You can connect it again later.</p>
          <div className="flex gap-2">
            <Button type="button" size="sm" pending={disconnect.isPending} onClick={() => disconnect.mutate()}>
              {disconnect.isPending ? "Disconnecting…" : `Yes, disconnect ${name}`}
            </Button>
            <Button type="button" size="sm" variant="secondary" disabled={disconnect.isPending} onClick={() => setAsking(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {start.isError && <ErrorText>{start.error.message}</ErrorText>}
      {disconnect.isError && <ErrorText>{disconnect.error.message}</ErrorText>}
    </li>
  );
}
