import { createContext } from "react";
import type { AuthSession } from "@flowdesc/contracts";

export type AuthUser = AuthSession["user"];
export type AuthOrganization = AuthSession["organization"];

/**
 * Why there is no session any more. "expired" and "idle" are the session ending on its own (the login page says so);
 * "signed-out" is the person pressing "Log out" (no message, but it still means "go to the login page": the landing page
 * at `/` is only for people who were never signed in on this page load, ADR 0043).
 */
export type SessionEndReason = "expired" | "idle" | "signed-out";

export interface AuthContextValue {
  user: AuthUser | null;
  organization: AuthOrganization | null;
  accessToken: string | null;
  /** True only while the initial silent refresh (on page load) is in flight. */
  isLoading: boolean;
  /** Set when the session ended (it expired, the person was inactive, or they logged out); cleared by the next login. */
  endedReason: SessionEndReason | null;
  login: (session: AuthSession) => void;
  logout: () => void;
  /** End the session because of `reason` (not a button press), so the login page can explain it. */
  endSession: (reason: SessionEndReason) => void;
  /** The login page has been reached (and has the notice, if any), so a later visit to `/` is a visitor's again: the landing page. */
  forgetSessionEnd: () => void;
}

// Split from AuthContext.tsx / useAuth.ts on purpose: a file that exports
// only components can be Fast-Refreshed by Vite; mixing in a plain value
// (the context object) or a hook breaks that. See eslint-plugin-react-refresh.
export const AuthContext = createContext<AuthContextValue | null>(null);
