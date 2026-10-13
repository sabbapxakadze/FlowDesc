import { useQuery } from "@tanstack/react-query";
import { fetchApiTokens } from "./fetchApiTokens";
import { apiTokenKeys } from "./queryKeys";

/**
 * The signed-in person's personal access tokens (ADR 0070): names, dates and state, never the secret (the server only
 * sends that once, when a token is made). `enabled: false` for a demo copy, where the server refuses tokens.
 */
export function useApiTokens(options: { enabled?: boolean; refetchIntervalMs?: number } = {}) {
  return useQuery({
    queryKey: apiTokenKeys.list,
    queryFn: fetchApiTokens,
    enabled: options.enabled ?? true,
    // The sidebar's MCP dot asks again every so often (ADR 0071). TanStack Query pauses an interval in a hidden tab by default.
    refetchInterval: options.refetchIntervalMs,
  });
}
