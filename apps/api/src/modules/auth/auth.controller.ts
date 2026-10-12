import type { Request, Response } from "express";
import {
  authSessionSchema,
  confirmPasswordResetRequestSchema,
  loginRequestSchema,
  registerRequestSchema,
  registerResponseSchema,
  requestPasswordResetRequestSchema,
  verifyEmailRequestSchema,
  changePasswordRequestSchema,
  confirmEmailChangeRequestSchema,
  getAccountResponseSchema,
  requestEmailChangeRequestSchema,
  setPasswordRequestSchema,
  updateTimezoneRequestSchema,
} from "@flowdesc/contracts";
import { env } from "../../config/env.js";
import { AppError } from "../../shared/errors.js";
import * as authService from "./auth.service.js";

const REFRESH_COOKIE_NAME = "flowdesc_refresh_token";
const REFRESH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/**
 * httpOnly so client-side JS can never read it (the whole point — an XSS
 * bug can't steal it). Scoped to the auth path only, so it's never sent on
 * ordinary API calls, just the endpoints that actually need it. secure is
 * relaxed in development because plain http://localhost can't set a
 * Secure cookie at all. See ADR 0003.
 */
function refreshCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: env.NODE_ENV !== "development",
    path: "/api/v1/auth",
  };
}

export function setRefreshCookie(res: Response, refreshToken: string) {
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    ...refreshCookieOptions(),
    maxAge: REFRESH_COOKIE_MAX_AGE_MS,
  });
}

function readRefreshCookie(req: Request): string {
  const token: unknown = req.cookies?.[REFRESH_COOKIE_NAME];
  if (typeof token !== "string" || token.length === 0) {
    throw new AppError("invalid_refresh_token", 401, "No active session.");
  }
  return token;
}

export async function register(req: Request, res: Response) {
  const parsed = registerRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(
      "validation_error",
      400,
      "Invalid registration details",
      parsed.error.flatten().fieldErrors,
    );
  }

  const { user, organization } = await authService.register(parsed.data);

  const body = registerResponseSchema.parse({
    user: { id: user.id, email: user.email, name: user.name },
    organization: { id: organization.id, name: organization.name, slug: organization.slug },
  });

  res.status(201).json(body);
}

export async function login(req: Request, res: Response) {
  const parsed = loginRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(
      "validation_error",
      400,
      "Invalid login details",
      parsed.error.flatten().fieldErrors,
    );
  }

  const { accessToken, refreshToken, user, organization } = await authService.login(parsed.data);
  setRefreshCookie(res, refreshToken);

  const body = authSessionSchema.parse({ accessToken, user, organization });
  res.status(200).json(body);
}

export async function refresh(req: Request, res: Response) {
  const refreshToken = readRefreshCookie(req);

  try {
    const result = await authService.refresh(refreshToken);
    setRefreshCookie(res, result.refreshToken);
    const body = authSessionSchema.parse({
      accessToken: result.accessToken,
      user: result.user,
      organization: result.organization,
    });
    res.status(200).json(body);
  } catch (err) {
    // Any failure here (expired, reused, revoked) means the cookie the
    // browser is holding is no good anymore — clear it so the client
    // doesn't keep retrying with a token that will never work again.
    res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
    throw err;
  }
}

export async function logout(req: Request, res: Response) {
  const refreshToken = readRefreshCookie(req);
  await authService.logout(refreshToken);
  res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
  res.status(204).end();
}

export async function logoutAll(req: Request, res: Response) {
  const refreshToken = readRefreshCookie(req);
  await authService.logoutAll(refreshToken);
  res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
  res.status(204).end();
}

function badRequest(message: string, parsed: { error: { flatten: () => { fieldErrors: Record<string, string[] | undefined> } } }) {
  return new AppError("validation_error", 400, message, parsed.error.flatten().fieldErrors as Record<string, string[]>);
}

export async function getAccount(req: Request, res: Response) {
  const data = await authService.getAccount(req.auth!.userId);
  res.json(getAccountResponseSchema.parse({ data }));
}

export async function updateTimezone(req: Request, res: Response) {
  const parsed = updateTimezoneRequestSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest("Invalid timezone", parsed);
  await authService.updateTimezone(req.auth!.userId, parsed.data.timezone);
  res.json(getAccountResponseSchema.parse({ data: await authService.getAccount(req.auth!.userId) }));
}

/** Needs the refresh cookie as well as the access token: the cookie says which session is "this device" (kept). */
export async function changePassword(req: Request, res: Response) {
  const parsed = changePasswordRequestSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest("Invalid password change", parsed);
  const cookie: unknown = req.cookies?.[REFRESH_COOKIE_NAME];
  const { keptThisSession } = await authService.changePassword({
    userId: req.auth!.userId,
    ...parsed.data,
    refreshToken: typeof cookie === "string" && cookie.length > 0 ? cookie : undefined,
  });
  if (!keptThisSession) res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
  res.status(200).json({ keptThisSession });
}

/** The first password of an account made with Google/GitHub (ADR 0042); like change-password it needs the refresh cookie. */
export async function setPassword(req: Request, res: Response) {
  const parsed = setPasswordRequestSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest("Invalid password", parsed);
  const cookie: unknown = req.cookies?.[REFRESH_COOKIE_NAME];
  const { keptThisSession } = await authService.setPassword({
    userId: req.auth!.userId,
    ...parsed.data,
    refreshToken: typeof cookie === "string" && cookie.length > 0 ? cookie : undefined,
  });
  if (!keptThisSession) res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
  res.status(200).json({ keptThisSession });
}

export async function requestEmailChange(req: Request, res: Response) {
  const parsed = requestEmailChangeRequestSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest("Invalid email change", parsed);
  const result = await authService.requestEmailChange({ userId: req.auth!.userId, ...parsed.data });
  res.status(202).json(result);
}

export async function confirmEmailChange(req: Request, res: Response) {
  const parsed = confirmEmailChangeRequestSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest("Invalid confirmation request", parsed);
  await authService.confirmEmailChange(parsed.data.token);
  res.status(204).end();
}

export async function verifyEmail(req: Request, res: Response) {
  const parsed = verifyEmailRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(
      "validation_error",
      400,
      "Invalid verification request",
      parsed.error.flatten().fieldErrors,
    );
  }

  await authService.verifyEmail(parsed.data.token);
  res.status(204).end();
}

export async function requestPasswordReset(req: Request, res: Response) {
  const parsed = requestPasswordResetRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(
      "validation_error",
      400,
      "Invalid request",
      parsed.error.flatten().fieldErrors,
    );
  }

  await authService.requestPasswordReset(parsed.data.email);
  // Always 204, whether or not the email exists — see auth.service.ts's
  // requestPasswordReset for why (non-enumeration, same as login).
  res.status(204).end();
}

export async function confirmPasswordReset(req: Request, res: Response) {
  const parsed = confirmPasswordResetRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(
      "validation_error",
      400,
      "Invalid password reset request",
      parsed.error.flatten().fieldErrors,
    );
  }

  await authService.confirmPasswordReset(parsed.data);
  res.status(204).end();
}
