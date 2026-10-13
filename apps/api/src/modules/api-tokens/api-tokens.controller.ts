import type { Request, Response } from "express";
import { createApiTokenRequestSchema } from "@flowdesc/contracts";
import { AppError } from "../../shared/errors.js";
import { logger } from "../../lib/logger.js";
import * as service from "./api-tokens.service.js";

function requireUser(req: Request): string {
  if (!req.auth) throw new Error("api-tokens routes require requireAuth to have run first");
  return req.auth.userId;
}

export async function create(req: Request, res: Response) {
  const userId = requireUser(req);
  const parsed = createApiTokenRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError("validation_error", 400, "Invalid token request", parsed.error.flatten().fieldErrors);
  }
  const created = await service.create(userId, parsed.data);
  // The token itself is never logged, only that one was made.
  logger.info({ userId, tokenId: created.data.id, scope: created.data.scope }, "access token created");
  res.status(201).json(created);
}

export async function list(req: Request, res: Response) {
  res.json({ data: await service.list(requireUser(req)) });
}

export async function revoke(req: Request, res: Response) {
  const userId = requireUser(req);
  const tokenId = req.params.tokenId;
  if (typeof tokenId !== "string" || !/^[0-9a-f-]{36}$/i.test(tokenId)) {
    throw new AppError("token_not_found", 404, "That token was not found.");
  }
  await service.revoke(userId, tokenId);
  logger.info({ userId, tokenId }, "access token revoked");
  res.status(204).end();
}

export async function context(req: Request, res: Response) {
  res.json({ data: await service.context(requireUser(req)) });
}
