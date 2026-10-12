import type { Request, Response } from "express";
import { z } from "zod";
import {
  acceptInvitationRequestSchema,
  acceptInvitationResponseSchema,
  createInvitationRequestSchema,
  createInvitationResponseSchema,
  listInvitationsResponseSchema,
  previewInvitationRequestSchema,
  previewInvitationResponseSchema,
} from "@flowdesc/contracts";
import { AppError } from "../../shared/errors.js";
import * as invitationsService from "./invitations.service.js";

function requireCtx(req: Request) {
  if (!req.ctx) {
    throw new Error("This handler requires requireOrgMembership to have run first");
  }
  return req.ctx;
}

export async function list(req: Request, res: Response) {
  const ctx = requireCtx(req);
  const data = await invitationsService.listInvitations(ctx.organizationId);
  res.json(listInvitationsResponseSchema.parse({ data }));
}

export async function create(req: Request, res: Response) {
  const ctx = requireCtx(req);
  const parsed = createInvitationRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError("validation_error", 400, "Invalid invitation", parsed.error.flatten().fieldErrors);
  }

  const result = await invitationsService.createInvitation({
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    email: parsed.data.email,
    role: parsed.data.role,
  });
  res.status(201).json(createInvitationResponseSchema.parse(result));
}

export async function revoke(req: Request, res: Response) {
  const ctx = requireCtx(req);
  const invitationId = z.uuid().safeParse(req.params.invitationId);
  if (!invitationId.success) {
    throw new AppError("invalid_invitation_id", 400, "invitationId must be a UUID.");
  }
  await invitationsService.revokeInvitation(ctx.organizationId, invitationId.data, ctx.userId);
  res.status(204).end();
}

export async function preview(req: Request, res: Response) {
  const parsed = previewInvitationRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError("validation_error", 400, "Invalid request", parsed.error.flatten().fieldErrors);
  }
  const result = await invitationsService.previewInvitation(parsed.data.token);
  res.json(previewInvitationResponseSchema.parse(result));
}

export async function accept(req: Request, res: Response) {
  const parsed = acceptInvitationRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError("validation_error", 400, "Invalid details", parsed.error.flatten().fieldErrors);
  }
  const { user, organization } = await invitationsService.acceptInvitation(parsed.data);
  res.status(201).json(
    acceptInvitationResponseSchema.parse({
      user: { id: user.id, email: user.email, name: user.name },
      organization,
    }),
  );
}

export async function resend(req: Request, res: Response) {
  const ctx = requireCtx(req);
  const invitationId = z.uuid().safeParse(req.params.invitationId);
  if (!invitationId.success) {
    throw new AppError("invalid_invitation_id", 400, "invitationId must be a UUID.");
  }
  const result = await invitationsService.resendInvitation({
    organizationId: ctx.organizationId,
    actorId: ctx.userId,
    invitationId: invitationId.data,
  });
  res.status(201).json(createInvitationResponseSchema.parse(result));
}
