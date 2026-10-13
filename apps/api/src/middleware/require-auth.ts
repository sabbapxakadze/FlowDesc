import type { NextFunction, Request, Response } from "express";
import { API_TOKEN_PREFIX } from "@flowdesc/contracts";
import * as apiTokensRepository from "../modules/api-tokens/api-tokens.repository.js";
import { hashToken, verifyAccessToken } from "../modules/auth/tokens.js";
import { AppError } from "../shared/errors.js";
import { tokenMayCall } from "./token-access.js";

/**
 * "Who is making this request" — nothing about what they're allowed to
 * do (that's requireOrgMembership + requirePermission, run after this).
 * Two kinds of bearer are accepted: the short-lived access token of a
 * signed-in session, and a personal access token (`fd_pat_...`, ADR 0070)
 * that a person gave to an automated client. A thrown error here, sync or
 * async, is caught by Express automatically — no manual try/catch-and-forward.
 */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new AppError("unauthenticated", 401, "Missing or invalid Authorization header.");
  }

  const token = header.slice("Bearer ".length);

  if (token.startsWith(API_TOKEN_PREFIX)) {
    const now = new Date();
    // Not found covers unknown, revoked and expired alike, and says nothing about which.
    const found = await apiTokensRepository.findUsableByHash(hashToken(token), now);
    if (!found) throw new AppError("unauthenticated", 401, "Invalid, revoked or expired access token.");
    if (!tokenMayCall(req.method, req.originalUrl)) {
      throw new AppError("token_not_allowed", 403, "An access token cannot do this. Use the app instead.");
    }
    await apiTokensRepository.touch(found.id, now);
    req.auth = { userId: found.userId, token: { id: found.id, scope: found.scope } };
    next();
    return;
  }

  try {
    const { userId } = verifyAccessToken(token);
    req.auth = { userId };
    next();
  } catch {
    throw new AppError("unauthenticated", 401, "Invalid or expired access token.");
  }
}
