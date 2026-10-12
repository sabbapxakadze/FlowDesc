import type { Request, Response } from "express";
import {
  avatarResponseSchema,
  profileActivityQuerySchema,
  profileActivityResponseSchema,
  profileNudgeResponseSchema,
  tourPendingResponseSchema,
  profileResponseSchema,
  updateProfileRequestSchema,
} from "@flowdesc/contracts";
import { readFileStream } from "../../lib/storage.js";
import { AppError } from "../../shared/errors.js";
import * as profilesService from "./profiles.service.js";

function requireUser(req: Request): string {
  if (!req.auth) throw new Error("profiles routes require requireAuth to have run first");
  return req.auth.userId;
}

function requireCtx(req: Request) {
  if (!req.ctx) throw new Error("this route requires requireOrgMembership to have run first");
  return req.ctx;
}

function userIdParam(req: Request): string {
  const id = req.params.userId;
  if (typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id)) {
    throw new AppError("profile_not_found", 404, "That person was not found in this organization.");
  }
  return id;
}

export async function updateMine(req: Request, res: Response) {
  const userId = requireUser(req);
  const parsed = updateProfileRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError("validation_error", 400, "Invalid profile", parsed.error.flatten().fieldErrors);
  }
  await profilesService.updateMyProfile(userId, parsed.data);
  res.status(204).end();
}

export async function uploadAvatar(req: Request, res: Response) {
  const userId = requireUser(req);
  if (!req.file) throw new AppError("no_file", 400, "Choose a picture to upload.");
  const avatarUrl = await profilesService.setMyAvatar(userId, req.file.buffer);
  res.json(avatarResponseSchema.parse({ avatarUrl }));
}

export async function removeAvatar(req: Request, res: Response) {
  await profilesService.removeMyAvatar(requireUser(req));
  res.json(avatarResponseSchema.parse({ avatarUrl: null }));
}

export async function getProfile(req: Request, res: Response) {
  const ctx = requireCtx(req);
  const profile = await profilesService.getProfile(ctx.organizationId, userIdParam(req));
  res.json(profileResponseSchema.parse({ data: profile }));
}

export async function getActivity(req: Request, res: Response) {
  const ctx = requireCtx(req);
  const parsed = profileActivityQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("validation_error", 400, "Invalid activity query", parsed.error.flatten().fieldErrors);
  }
  const result = await profilesService.getActivity(ctx.organizationId, userIdParam(req), parsed.data);
  res.json(profileActivityResponseSchema.parse(result));
}

/**
 * Deliberately unauthenticated (an img tag cannot send the bearer token): the random key in the
 * URL is the access, and a key that was replaced or removed answers 404 (ADR 0028).
 */
export async function serveAvatar(req: Request, res: Response) {
  const storageKey = await profilesService.openAvatar(String(req.params.key));
  res.setHeader("Content-Type", "image/webp");
  res.setHeader("X-Content-Type-Options", "nosniff");
  // The key changes with every new photo, so a given URL never changes meaning: cache it hard.
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  let stream;
  try {
    stream = await readFileStream(storageKey);
  } catch {
    return void res.status(404).end(); // the photo's file is gone: the key exists, the bytes do not
  }
  stream.on("error", () => {
    if (!res.headersSent) res.status(404).end();
    else res.destroy();
  });
  stream.pipe(res);
}

export async function getNudge(req: Request, res: Response) {
  res.json(profileNudgeResponseSchema.parse({ show: await profilesService.shouldShowNudge(requireUser(req)) }));
}

export async function getTour(req: Request, res: Response) {
  res.json(tourPendingResponseSchema.parse({ pending: await profilesService.isTourPending(requireUser(req)) }));
}

export async function markTourSeen(req: Request, res: Response) {
  await profilesService.markTourSeen(requireUser(req));
  res.status(204).end();
}

export async function dismissNudge(req: Request, res: Response) {
  await profilesService.dismissNudge(requireUser(req));
  res.status(204).end();
}
