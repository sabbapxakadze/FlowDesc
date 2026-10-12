import type { Request, Response } from "express";
import {
  OAUTH_ERROR_CODES,
  oauthProviderSchema,
  oauthProvidersResponseSchema,
  startOAuthRequestSchema,
  startOAuthResponseSchema,
  type OAuthErrorCode,
} from "@flowdesc/contracts";
import { env } from "../../config/env.js";
import { enabledProviders } from "../../lib/oauth/index.js";
import { logger } from "../../lib/logger.js";
import { AppError } from "../../shared/errors.js";
import { assertNotDemoUser } from "../demo/demo.guard.js";
import { setRefreshCookie } from "./auth.controller.js";
import * as oauthService from "./oauth.service.js";
import { verifyAccessToken } from "./tokens.js";

const STATE_COOKIE_NAME = "flowdesc_oauth_state";
/** Test only: the profile the fake provider should sign in as (see lib/oauth/fake.ts). */
const FAKE_PROFILE_COOKIE_NAME = "flowdesc_fake_oauth";

/** Same attributes as the refresh cookie: httpOnly, lax (it must come back on the provider's redirect), auth path only. */
function stateCookieOptions() {
  return { httpOnly: true, sameSite: "lax" as const, secure: env.NODE_ENV !== "development", path: "/api/v1/auth" };
}

function parseProvider(req: Request) {
  const parsed = oauthProviderSchema.safeParse(req.params.provider);
  if (!parsed.success) throw new AppError("oauth_provider_unavailable", 404, "This sign-in method is not available.");
  return parsed.data;
}

export function listProviders(_req: Request, res: Response) {
  res.json(oauthProvidersResponseSchema.parse({ data: { providers: enabledProviders() } }));
}

/**
 * A fetch, not a browser navigation: "connect" has to carry the access token (it lives in memory, a navigation cannot
 * send it), and the answer is just the URL to go to. The state cookie is set on this response.
 */
export async function start(req: Request, res: Response) {
  const provider = parseProvider(req);
  const parsed = startOAuthRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError("validation_error", 400, "Invalid request", parsed.error.flatten().fieldErrors as Record<string, string[]>);
  }

  let userId: string | undefined;
  if (parsed.data.intent === "link") {
    const header = req.headers.authorization;
    try {
      if (!header?.startsWith("Bearer ")) throw new Error("no token");
      userId = verifyAccessToken(header.slice("Bearer ".length)).userId;
    } catch {
      throw new AppError("unauthenticated", 401, "Log in to connect an account.");
    }
    await assertNotDemoUser(userId!, "Connecting a sign-in account");
  }

  const fakeHint: unknown = req.cookies?.[FAKE_PROFILE_COOKIE_NAME];
  const { url, stateCookie } = oauthService.startAuthorization({
    provider,
    intent: parsed.data.intent,
    userId,
    hint: env.NODE_ENV === "test" && typeof fakeHint === "string" ? fakeHint : undefined,
  });
  res.cookie(STATE_COOKIE_NAME, stateCookie, { ...stateCookieOptions(), maxAge: 10 * 60 * 1000 });
  res.json(startOAuthResponseSchema.parse({ url }));
}

function knownCode(code: string): OAuthErrorCode {
  return (OAUTH_ERROR_CODES as readonly string[]).includes(code) ? (code as OAuthErrorCode) : "oauth_failed";
}

/**
 * The provider sends the browser here. Every outcome is a redirect back into the web app: success with a refresh cookie
 * already set (the app signs in by refreshing, like on any page load), failure with `?oauth_error=<code>`. No token and
 * no profile data ever appears in a URL.
 */
export async function callback(req: Request, res: Response) {
  const stateCookie: unknown = req.cookies?.[STATE_COOKIE_NAME];
  // Single use: whatever happens next, this attempt's state is spent (a replayed callback has no cookie).
  res.clearCookie(STATE_COOKIE_NAME, stateCookieOptions());

  const failTo = (page: string, code: string) => res.redirect(`${env.APP_URL}${page}?oauth_error=${knownCode(code)}`);
  let provider;
  try {
    provider = parseProvider(req);
  } catch {
    return failTo("/login", "oauth_failed");
  }

  // The person pressed "Cancel" at the provider, or it refused: no code arrives.
  const code = typeof req.query.code === "string" ? req.query.code : undefined;
  const state = typeof req.query.state === "string" ? req.query.state : undefined;
  if (!code) return failTo("/login", typeof req.query.error === "string" ? "oauth_cancelled" : "oauth_state_invalid");

  let page = "/login";
  try {
    const result = await oauthService.completeAuthorization({
      provider,
      code,
      state,
      stateCookie: typeof stateCookie === "string" ? stateCookie : undefined,
    });
    if (result.kind === "link") {
      return res.redirect(`${env.APP_URL}/account?connected=${result.provider}`);
    }
    setRefreshCookie(res, result.session.refreshToken);
    return res.redirect(`${env.APP_URL}/`);
  } catch (err) {
    if (err instanceof AppError) {
      // Connecting happens on the account page, so a failure goes back there.
      if (stateCookie && err.code === "oauth_identity_taken") page = "/account";
      if (err.code === "no_organization") return failTo(page, "oauth_no_organization");
      logger.warn({ code: err.code, details: err.details }, "oauth callback failed");
      return failTo(page, err.code);
    }
    logger.error({ err }, "oauth callback crashed");
    return failTo(page, "oauth_failed");
  }
}

export async function disconnect(req: Request, res: Response) {
  const provider = parseProvider(req);
  await oauthService.disconnect(req.auth!.userId, provider);
  res.status(204).end();
}
