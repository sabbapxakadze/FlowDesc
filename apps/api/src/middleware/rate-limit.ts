import { createHash } from "node:crypto";
import { API_TOKEN_PREFIX } from "@flowdesc/contracts";
import rateLimit from "express-rate-limit";
import type { Request, Response } from "express";
import { env } from "../config/env.js";

/**
 * In-memory store — the default, and fine for one process. It resets on
 * restart and doesn't share state across multiple instances, which is
 * exactly why Redis is a "Later" stack item (see CLAUDE.md) rather than
 * pulled forward just for this.
 *
 * Same response shape as every other error in this app (see
 * shared/errors.ts / middleware/error-handler.ts) — a rate-limited
 * request shouldn't look different from any other rejected one.
 */
function tooManyRequests(req: Request, res: Response) {
  res.status(429).json({
    error: {
      code: "too_many_requests",
      message: "Too many attempts. Please try again later.",
      requestId: req.id,
    },
  });
}

/**
 * Skipped entirely under NODE_ENV=test — not a workaround, a standard
 * pattern. The whole test suite runs against one shared in-process app
 * (see app.ts), and legitimate tests in *other* files call /auth/register
 * and /auth/login for real, many times, well past any limit meant for a
 * real attacker. The mechanism itself (does express-rate-limit's config
 * actually 429 correctly) is proven separately, in rate-limit.test.ts, by
 * an isolated app that never goes through this skip.
 */
function skipInTest(): boolean {
  return env.NODE_ENV === "test";
}

// The classic brute-force target — kept strict.
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  handler: tooManyRequests,
});

// Starting and finishing a provider sign-in are two requests each, and nothing here can be guessed (the provider does
// the authenticating), so this is looser than the password login limit.
export const oauthRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  handler: tooManyRequests,
});

// "Try the demo" builds several hundred rows per click (ADR 0044), so one address gets only a few a hour.
export const demoStartRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  handler: tooManyRequests,
});

// Spam account creation, not credential guessing — looser window is fine.
export const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  handler: tooManyRequests,
});

// Prevents email-bombing an address via repeated reset requests.
export const passwordResetRequestRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  handler: tooManyRequests,
});

// A personal access token (ADR 0070) is for an automated client, which can call far faster than a person, so each token gets a
// ceiling of its own. Keyed by a hash of the token, not the address, so it does not depend on the proxy setup and one runaway
// client cannot use up another person's allowance. Only requests that carry such a token are counted; it runs before sign-in, so
// guessing token values is slowed down too.
const ACCESS_TOKEN_PREFIX = `Bearer ${API_TOKEN_PREFIX}`;
export const tokenRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => env.NODE_ENV === "test" || !req.headers.authorization?.startsWith(ACCESS_TOKEN_PREFIX),
  keyGenerator: (req) => createHash("sha256").update(req.headers.authorization ?? "").digest("hex"),
  handler: tooManyRequests,
});

// Writes through a token (ADR 0074) get a much lower ceiling than reads: an AI that loops on "create issue" should be stopped long before
// it has made hundreds. Same keying as above, counted separately (the key carries a prefix), and only for requests that are not GET.
export const tokenWriteRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => env.NODE_ENV === "test" || req.method === "GET" || !req.headers.authorization?.startsWith(ACCESS_TOKEN_PREFIX),
  keyGenerator: (req) => `write:${createHash("sha256").update(req.headers.authorization ?? "").digest("hex")}`,
  handler: tooManyRequests,
});
