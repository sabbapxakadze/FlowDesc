import { useEffect, useState } from "react";
import { Link } from "react-router";
import { describeMcpStatus, mcpState, nowMs, useApiTokens } from "../../../entities/api-token";
import { useAuth } from "../../../shared/auth/useAuth";
import { cn } from "../../../shared/ui";

const CHECK_EVERY_MS = 30_000;

/**
 * The small "MCP" pill beside the theme switch (ADR 0071): a green dot while an access token was used in the last five minutes (an AI app is
 * reading your data), grey otherwise. It is a link to the Access tokens section, where a token can be revoked. It says "in use", not
 * "connected", because FlowDesc keeps no connection to the AI app's local program (see `mcpStatus.ts`). The state is also in the tooltip and
 * the accessible name, so the dot's colour is never the only signal. A demo copy has no tokens, so it shows nothing.
 */
export function McpStatus() {
  const { organization } = useAuth();
  const inDemo = Boolean(organization?.demoExpiresAt);
  const tokens = useApiTokens({ enabled: !inDemo, refetchIntervalMs: CHECK_EVERY_MS });
  // The list can stay identical while the clock moves on (the last request slides out of the window), so the pill re-reads the clock on its own.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (inDemo) return;
    const timer = setInterval(() => setTick((n) => n + 1), CHECK_EVERY_MS);
    return () => clearInterval(timer);
  }, [inDemo]);

  if (inDemo) return null;

  const now = nowMs();
  const list = tokens.data ?? [];
  const label = tokens.isPending ? "MCP: checking" : tokens.isError ? "MCP: status unavailable" : describeMcpStatus(list, now);
  const inUse = !tokens.isPending && !tokens.isError && mcpState(list, now) === "in-use";

  return (
    <Link
      to="/account#access-tokens"
      data-tour="mcp-status"
      data-mcp-state={inUse ? "in-use" : "idle"}
      aria-label={label}
      title={label}
      className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border border-[var(--color-border-sidebar)] px-2 py-1 text-xs font-medium text-[var(--color-text-sidebar)] hover:bg-[var(--color-bg-sidebar-active)] hover:text-[var(--color-text-sidebar-active)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-text-sidebar-active)]"
    >
      <span
        aria-hidden="true"
        className={cn(
          "h-2 w-2 rounded-full",
          inUse ? "bg-[var(--color-bg-action-success)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-bg-action-success)_30%,transparent)]" : "bg-[var(--color-text-sidebar)] opacity-40",
        )}
      />
      MCP
    </Link>
  );
}
