import { OAUTH_ERROR_CODES, type OAuthErrorCode, type OAuthProviderName } from "@flowdesc/contracts";

export const PROVIDER_LABELS: Record<OAuthProviderName, string> = { google: "Google", github: "GitHub" };

const ERROR_MESSAGES: Record<OAuthErrorCode, string> = {
  oauth_cancelled: "Sign-in was cancelled.",
  oauth_state_invalid: "The sign-in attempt expired or did not start here. Please try again.",
  oauth_exchange_failed: "Could not complete sign-in with the provider. Please try again.",
  oauth_email_unverified: "That provider has not verified your email address, so it cannot be used to sign in.",
  oauth_identity_taken:
    "That account cannot be connected: it already belongs to a FlowDesc account, or you connected a different one for this provider.",
  oauth_no_organization: "You are not a member of any organization. Ask an owner to invite you again.",
  oauth_failed: "Sign-in did not finish. Please try again.",
};

/** The words for an `?oauth_error=` code; anything unknown (a hand-edited URL) gets the general one. */
export function oauthErrorMessage(code: string): string {
  return (OAUTH_ERROR_CODES as readonly string[]).includes(code) ? ERROR_MESSAGES[code as OAuthErrorCode] : ERROR_MESSAGES.oauth_failed;
}
