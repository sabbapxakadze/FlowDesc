export const OAUTH_PROVIDERS = ["google", "github"] as const;
export type OAuthProviderName = (typeof OAUTH_PROVIDERS)[number];

/** What FlowDesc needs to know about a person from the provider, whichever provider it is. */
export interface OAuthProfile {
  /** The provider's own stable id for the person. Never the email: emails change hands. */
  providerUserId: string;
  email: string;
  /** Did the provider itself confirm the person controls this email? Linking and sign-up depend on it. */
  emailVerified: boolean;
  name: string;
}

/**
 * The seam between FlowDesc and a sign-in provider (same idea as lib/email.ts and lib/storage.ts): the service only
 * talks to this interface, so the real providers and the test fake are interchangeable.
 */
export interface OAuthProvider {
  name: OAuthProviderName;
  authorizeUrl(input: { state: string; codeChallenge: string; redirectUri: string; hint?: string }): string;
  /** Trade the one-time code for the person's profile (server to server, with the PKCE verifier). */
  exchange(input: { code: string; codeVerifier: string; redirectUri: string }): Promise<OAuthProfile>;
}
