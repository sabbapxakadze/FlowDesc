import type { ApiToken } from "@flowdesc/contracts";

/**
 * What the "MCP" dot in the sidebar means (ADR 0071). An AI app talks to FlowDesc through a local program that makes ordinary requests with an
 * access token; FlowDesc keeps no open connection to it. So "connected" can only mean "a token that still works was used a moment ago",
 * and that is what the dot says. An AI app that is open but quiet shows grey.
 *
 * The server writes a token's `lastUsedAt` at most once a minute, so a green dot can trail real use by up to a minute; the window is
 * five minutes so one quiet stretch between requests does not flip it.
 */
export const MCP_ACTIVE_WINDOW_MS = 5 * 60_000;

export type McpState = "in-use" | "idle" | "no-token";

/** The clock, read in one named place so a component does not call `Date.now()` while it renders. */
export function nowMs(): number {
  return Date.now();
}

/** A token that still works: not revoked and not past its date. */
function isUsable(token: ApiToken, now: number): boolean {
  return token.revokedAt === null && new Date(token.expiresAt).getTime() > now;
}

function lastUseOfUsable(tokens: readonly ApiToken[], now: number): number | undefined {
  let latest: number | undefined;
  for (const token of tokens) {
    if (!isUsable(token, now) || token.lastUsedAt === null) continue;
    const at = new Date(token.lastUsedAt).getTime();
    if (latest === undefined || at > latest) latest = at;
  }
  return latest;
}

export function mcpState(tokens: readonly ApiToken[], now: number): McpState {
  if (!tokens.some((token) => isUsable(token, now))) return "no-token";
  const last = lastUseOfUsable(tokens, now);
  return last !== undefined && now - last <= MCP_ACTIVE_WINDOW_MS ? "in-use" : "idle";
}

export function isMcpActive(tokens: readonly ApiToken[], now: number): boolean {
  return mcpState(tokens, now) === "in-use";
}

/** The sentence for the tooltip and screen readers. The colour alone never carries the state. */
export function describeMcpStatus(tokens: readonly ApiToken[], now: number): string {
  const state = mcpState(tokens, now);
  if (state === "no-token") return "MCP: no access token yet. Open Account to set one up.";
  if (state === "idle") return "MCP: no recent activity (nothing has used your access token in the last 5 minutes).";
  const last = lastUseOfUsable(tokens, now) ?? now;
  const minutes = Math.floor((now - last) / 60_000);
  const ago = minutes < 1 ? "just now" : minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;
  return `MCP: in use (an access token was used ${ago}).`;
}
