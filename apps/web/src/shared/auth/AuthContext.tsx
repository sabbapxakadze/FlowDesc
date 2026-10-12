import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { AuthSession } from "@flowdesc/contracts";
import { apiPostVoid } from "../api/client";
import { setStoredAccessToken } from "./token-store";
import { AuthContext, type AuthOrganization, type AuthUser, type SessionEndReason } from "./auth-context";
import { connectSocket, disconnectSocket, reconnectSocket } from "../socket/socket-client";
import { setTimezone } from "../lib/timezone";
import { withViewTransition } from "../lib/motion";
import { returnedFromOAuth } from "./oauth-trip";
import { markTokenIssued, onSessionLost, onSessionRenewed, renewAccessToken, tokenAgeMs } from "./session-refresh";

/** A tab that comes back to the foreground renews first when its access token (15 minutes) is older than this. */
const RENEW_ON_RETURN_AFTER_MS = 10 * 60 * 1000;

/**
 * The access token lives here, in memory, and nowhere else — never
 * localStorage (see ADR 0003: an XSS bug can't steal what was never
 * stored). The cost of that choice is that a page reload wipes it, since
 * memory doesn't survive a reload. The silent refresh is what pays
 * that cost back: it uses the httpOnly refresh cookie (which *does*
 * survive a reload) to get a new access token automatically, so the user
 * doesn't have to log in again every time they refresh the page.
 *
 * The same refresh (session-refresh.ts, ADR 0038) also runs when a request is answered 401 and when a tab comes back
 * after a while, so a tab left open does not end up with a dead token. If the refresh finds the session gone, the person
 * is signed out here and sent to the login page with a notice.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [organization, setOrganization] = useState<AuthOrganization | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [endedReason, setEndedReason] = useState<SessionEndReason | null>(null);
  // Whether someone is signed in right now, readable from the listeners below without re-subscribing them.
  const signedIn = useRef(false);

  const login = useCallback((session: AuthSession) => {
    signedIn.current = true;
    setEndedReason(null);
    setUser(session.user);
    setOrganization(session.organization);
    setAccessToken(session.accessToken);
    setTimezone(session.user.timezone); // times on screen use the person's own timezone
    // The React state above is what triggers re-renders; the token store
    // is what shared/api/client.ts's fetch wrapper actually reads — kept
    // in sync here, on every login, so the next API call carries it.
    setStoredAccessToken(session.accessToken);
    markTokenIssued();
    // Same lifecycle the access token itself already follows — connect
    // once we have both a token and the org to join.
    connectSocket(session.organization.id);
  }, []);

  const clearSession = useCallback(() => {
    signedIn.current = false;
    setUser(null);
    setOrganization(null);
    setAccessToken(null);
    setStoredAccessToken(null);
    setTimezone(null);
    disconnectSocket();
  }, []);

  const logout = useCallback(() => {
    // The app cross-fades into the login page (a View Transition, like logging in) instead of vanishing in one frame.
    withViewTransition(() => {
      setEndedReason("signed-out");
      clearSession();
    });
    // Local state clears immediately either way; telling the server to
    // revoke the session is best-effort and shouldn't block the UI on it.
    void apiPostVoid("/v1/auth/logout").catch(() => undefined);
  }, [clearSession]);

  /** The session ended without the person asking: say why on the login page. `idle` also revokes it on the server. */
  const endSession = useCallback(
    (reason: SessionEndReason) => {
      setEndedReason(reason);
      clearSession();
      if (reason === "idle") void apiPostVoid("/v1/auth/logout").catch(() => undefined);
    },
    [clearSession],
  );

  const forgetSessionEnd = useCallback(() => setEndedReason(null), []);

  useEffect(() => {
    const stopRenewed = onSessionRenewed((session) => {
      // A background renewal: only the token changes (the person, the organization and the open socket stay).
      if (signedIn.current) {
        setAccessToken(session.accessToken);
        reconnectSocket();
      }
    });
    // Only a session that existed can be "lost": a first-time visitor's refresh finds no cookie, which is just "not signed in".
    const stopLost = onSessionLost(() => {
      if (signedIn.current) endSession("expired");
    });

    // Coming back from Google or GitHub the page has been blank until now: fade the app in instead of cutting to it.
    const fadeIn = returnedFromOAuth();
    renewAccessToken().then(
      (session) => {
        const enter = () => {
          login(session);
          setIsLoading(false);
        };
        if (fadeIn) withViewTransition(enter);
        else enter();
      },
      () => {
        // No valid cookie, or it's expired/already used — just means
        // nobody's logged in. Not an error worth surfacing.
        setIsLoading(false);
      },
    );

    // Returning to a tab that sat in the background: its timers may have slept, so the token may be dead or about to be.
    // Renew before the screen's queries refetch with it, instead of letting them fail first.
    function renewIfStale() {
      if (document.visibilityState === "hidden" || !signedIn.current) return;
      if (tokenAgeMs() > RENEW_ON_RETURN_AFTER_MS) renewAccessToken().catch(() => undefined);
    }
    document.addEventListener("visibilitychange", renewIfStale);
    window.addEventListener("online", renewIfStale);
    return () => {
      stopRenewed();
      stopLost();
      document.removeEventListener("visibilitychange", renewIfStale);
      window.removeEventListener("online", renewIfStale);
    };
  }, [login, endSession]);

  return (
    <AuthContext.Provider value={{ user, organization, accessToken, isLoading, endedReason, login, logout, endSession, forgetSessionEnd }}>
      {children}
    </AuthContext.Provider>
  );
}
