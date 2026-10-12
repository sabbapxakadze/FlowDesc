import { authSessionSchema, type AuthSession } from "@flowdesc/contracts";
import { setStoredAccessToken } from "./token-store";

/**
 * Renewing the access token (ADR 0038). The access token lives 15 minutes and only in memory; the httpOnly refresh cookie
 * (30 days) is what gets a new one. This is the ONE place that calls `POST /auth/refresh`: on page load, when a request is
 * answered 401, and when a tab comes back after a while.
 *
 * Why it is careful: the server ROTATES the refresh token on every call, and a spent token presented a second time is treated as
 * theft and revokes the whole session on every device (ADR 0003). So the same cookie must never be sent twice:
 * - within a tab, callers share one in-flight request (React StrictMode runs the page-load effect twice, and a screen of
 *   queries can all fail with 401 at once);
 * - across tabs, which share the cookie, a Web Lock (`navigator.locks`) lets one tab refresh at a time. A tab that waited
 *   then refreshes with the cookie the first tab just received, which is valid (a rotation, not a reuse).
 * A refresh whose answer is lost on the network cannot be retried safely; it ends up as a lost session.
 */

/** The refresh cookie is no longer valid (expired after 30 days, revoked, signed out elsewhere): the person must log in again. */
export class SessionLostError extends Error {
  constructor() {
    super("The session ended.");
    this.name = "SessionLostError";
  }
}

/** The refresh request never got an answer (offline, server down). The session may still be fine; try again later. */
export class RefreshNetworkError extends Error {
  constructor() {
    super("Could not reach the server.");
    this.name = "RefreshNetworkError";
  }
}

let inFlight: Promise<AuthSession> | null = null;
let tokenIssuedAt = Date.now();
const renewedListeners = new Set<(session: AuthSession) => void>();
const lostListeners = new Set<() => void>();

/** Called with every new session the refresh returns (the AuthProvider keeps its React state in step). */
export function onSessionRenewed(listener: (session: AuthSession) => void): () => void {
  renewedListeners.add(listener);
  return () => renewedListeners.delete(listener);
}

/** Called when a refresh finds the session gone. */
export function onSessionLost(listener: () => void): () => void {
  lostListeners.add(listener);
  return () => lostListeners.delete(listener);
}

/** Note that a fresh access token was just obtained some other way (a login). */
export function markTokenIssued(): void {
  tokenIssuedAt = Date.now();
}

/** How old the current access token is, in milliseconds. */
export function tokenAgeMs(): number {
  return Date.now() - tokenIssuedAt;
}

async function callRefresh(): Promise<AuthSession> {
  let res: Response;
  try {
    res = await fetch("/api/v1/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
  } catch {
    throw new RefreshNetworkError();
  }
  if (res.status === 401) throw new SessionLostError();
  if (!res.ok) throw new Error(`Refresh failed with status ${res.status}`);
  return authSessionSchema.parse(await res.json());
}

function withRefreshLock<T>(work: () => Promise<T>): Promise<T> {
  // Not every environment has Web Locks; without them a tab still never refreshes twice at once, only across tabs it is not guarded.
  return typeof navigator !== "undefined" && navigator.locks
    ? navigator.locks.request("flowdesc-refresh", work)
    : work();
}

export function renewAccessToken(): Promise<AuthSession> {
  inFlight ??= withRefreshLock(callRefresh)
    .then((session) => {
      setStoredAccessToken(session.accessToken);
      markTokenIssued();
      for (const listener of renewedListeners) listener(session);
      return session;
    })
    .catch((error: unknown) => {
      if (error instanceof SessionLostError)
        for (const listener of lostListeners) listener();
      throw error;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
