import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
// Default import for jsonwebtoken, same CJS-interop reason as in tokens.ts.
import jwt from "jsonwebtoken";
import { env } from "../../config/env.js";
import { getProvider, redirectUriFor, type OAuthProfile, type OAuthProviderName } from "../../lib/oauth/index.js";
import { AppError } from "../../shared/errors.js";
import * as authRepository from "./auth.repository.js";
import { generateUniqueSlug, startSessionFor } from "./auth.service.js";
import * as oauthRepository from "./oauth.repository.js";
import { generateOpaqueToken } from "./tokens.js";

/**
 * Sign in / sign up / connect through Google or GitHub (ADR 0042): the OAuth "authorization code" flow with PKCE.
 *
 * The state that must survive the trip to the provider and back (a random `state`, the PKCE verifier, what the person
 * is doing, and for "connect" who they are) travels in a short-lived signed cookie, so no table is needed. It is
 * signed with a key derived from JWT_SECRET and carries `typ: "oauth_state"` and no `sub`, so it can never be used as
 * an access token.
 */

export type OAuthIntent = "signin" | "link";

interface StateClaims {
  typ: "oauth_state";
  provider: OAuthProviderName;
  state: string;
  verifier: string;
  intent: OAuthIntent;
  userId?: string;
}

const STATE_TTL_SECONDS = 10 * 60;
const stateKey = () => `${env.JWT_SECRET}:oauth-state`;

const STATE_INVALID = () =>
  new AppError("oauth_state_invalid", 400, "The sign-in attempt expired or did not start here. Please try again.");

const sha256Base64Url = (value: string) => createHash("sha256").update(value).digest("base64url");

export function providerOrThrow(name: string) {
  const provider = getProvider(name);
  if (!provider) throw new AppError("oauth_provider_unavailable", 404, "This sign-in method is not available.");
  return provider;
}

/** Step one: make the state, and the provider's sign-in URL to send the browser to. `hint` is only used by the test fake. */
export function startAuthorization(input: {
  provider: OAuthProviderName;
  intent: OAuthIntent;
  userId?: string;
  hint?: string;
}): { url: string; stateCookie: string } {
  const provider = providerOrThrow(input.provider);
  if (input.intent === "link" && !input.userId) {
    throw new AppError("unauthenticated", 401, "Log in to connect an account.");
  }

  const state = generateOpaqueToken();
  const verifier = randomBytes(32).toString("base64url");
  const claims: StateClaims = {
    typ: "oauth_state",
    provider: input.provider,
    state,
    verifier,
    intent: input.intent,
    userId: input.userId,
  };
  return {
    url: provider.authorizeUrl({
      state,
      codeChallenge: sha256Base64Url(verifier),
      redirectUri: redirectUriFor(input.provider),
      hint: input.hint,
    }),
    stateCookie: jwt.sign(claims, stateKey(), { expiresIn: STATE_TTL_SECONDS }),
  };
}

function readState(cookie: string | undefined, provider: OAuthProviderName, state: string | undefined): StateClaims {
  if (!cookie || !state) throw STATE_INVALID();
  let claims: StateClaims;
  try {
    claims = jwt.verify(cookie, stateKey()) as StateClaims;
  } catch {
    throw STATE_INVALID();
  }
  if (claims.typ !== "oauth_state" || claims.provider !== provider) throw STATE_INVALID();
  const a = Buffer.from(claims.state);
  const b = Buffer.from(state);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw STATE_INVALID();
  return claims;
}

type Completed =
  | { kind: "signin"; session: Awaited<ReturnType<typeof startSessionFor>> }
  | { kind: "link"; provider: OAuthProviderName };

/** Step two: the provider sent the person back with a code. Check the state, learn who they are, then act. */
export async function completeAuthorization(input: {
  provider: OAuthProviderName;
  code: string;
  state: string | undefined;
  stateCookie: string | undefined;
}): Promise<Completed> {
  const provider = providerOrThrow(input.provider);
  const claims = readState(input.stateCookie, input.provider, input.state);

  const profile = await provider.exchange({
    code: input.code,
    codeVerifier: claims.verifier,
    redirectUri: redirectUriFor(input.provider),
  });

  if (claims.intent === "link") {
    if (!claims.userId) throw STATE_INVALID();
    await linkToUser(claims.userId, input.provider, profile);
    return { kind: "link", provider: input.provider };
  }
  return { kind: "signin", session: await signInOrUp(input.provider, profile) };
}

const IDENTITY_TAKEN = () =>
  new AppError(
    "oauth_identity_taken",
    409,
    "That account cannot be connected: it already belongs to a FlowDesc account, or you connected a different one for this provider.",
  );

function isUniqueViolation(err: unknown): boolean {
  const cause = typeof err === "object" && err !== null ? (err as { cause?: unknown }).cause : undefined;
  return typeof cause === "object" && cause !== null && (cause as { code?: unknown }).code === "23505";
}

async function linkToUser(userId: string, provider: OAuthProviderName, profile: OAuthProfile) {
  const existing = await oauthRepository.findIdentity(provider, profile.providerUserId);
  if (existing) {
    if (existing.userId === userId) return; // already connected: nothing to do
    throw IDENTITY_TAKEN();
  }
  try {
    await oauthRepository.createIdentity({ userId, provider, providerUserId: profile.providerUserId, email: profile.email });
  } catch (err) {
    // The person already has a different account of this provider connected (unique user + provider).
    if (isUniqueViolation(err)) throw IDENTITY_TAKEN();
    throw err;
  }
}

/**
 * The decision table of ADR 0042:
 *  1. this provider account is already connected -> that user signs in;
 *  2. the provider did not confirm the email -> refuse (an unconfirmed address proves nothing);
 *  3. a FlowDesc account has that email -> connect to it and sign in (an account whose own email was never verified is
 *     reset first: no password, no sessions, so a squatter who registered someone else's address cannot keep access);
 *  4. otherwise a new account with its own organization, with no password.
 */
async function signInOrUp(provider: OAuthProviderName, profile: OAuthProfile) {
  const identity = await oauthRepository.findIdentity(provider, profile.providerUserId);
  if (identity) {
    const user = await authRepository.findUserById(identity.userId);
    if (!user) throw STATE_INVALID();
    return startSessionFor(user);
  }

  if (!profile.emailVerified) {
    throw new AppError(
      "oauth_email_unverified",
      403,
      "The provider has not verified that email address, so it cannot be used to sign in.",
    );
  }

  const existing = await authRepository.findUserByEmail(profile.email);
  if (existing) {
    if (!existing.emailVerifiedAt) await authRepository.resetUnverifiedAccount(existing.id);
    try {
      await oauthRepository.createIdentity({
        userId: existing.id,
        provider,
        providerUserId: profile.providerUserId,
        email: profile.email,
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw IDENTITY_TAKEN();
      throw err;
    }
    return startSessionFor(existing);
  }

  const organizationName = `${profile.name}'s workspace`;
  let created;
  try {
    created = await authRepository.createUserWithOrganization({
      email: profile.email,
      passwordHash: null,
      name: profile.name,
      organizationName,
      organizationSlug: await generateUniqueSlug(organizationName),
      emailVerified: true,
      identity: { provider, providerUserId: profile.providerUserId, email: profile.email },
    });
  } catch (err) {
    // Two first sign-ins racing: the loser simply tries again from the top and finds the winner's account.
    if (isUniqueViolation(err)) throw new AppError("oauth_failed", 409, "Sign-in did not finish. Please try again.");
    throw err;
  }
  return startSessionFor(created.user);
}

/** Disconnect a provider, never the last way to sign in (the check is locked in the repository). */
export async function disconnect(userId: string, provider: OAuthProviderName): Promise<void> {
  const result = await oauthRepository.deleteIdentityKeepingOneMethod(userId, provider);
  if (result === "not_connected") throw new AppError("not_connected", 404, "That account is not connected.");
  if (result === "last_method") {
    throw new AppError(
      "last_sign_in_method",
      409,
      "This is your only way to sign in. Add a password before disconnecting it.",
    );
  }
}
