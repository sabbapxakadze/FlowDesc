import type { Request, Response } from "express";
import { z } from "zod";
import { listOrganizationMembersResponseSchema, updateMemberRoleRequestSchema } from "@flowdesc/contracts";
import { AppError } from "../../shared/errors.js";
import * as organizationsService from "./organizations.service.js";

export async function listMembers(req: Request, res: Response) {
  if (!req.ctx) {
    throw new Error("listMembers requires requireOrgMembership to have run first");
  }

  const rows = await organizationsService.listMembers(req.ctx.organizationId);
  res.json(listOrganizationMembersResponseSchema.parse({ data: rows }));
}

function targetUserId(req: Request): string {
  const parsed = z.uuid().safeParse(req.params.userId);
  if (!parsed.success) throw new AppError("invalid_user_id", 400, "userId must be a UUID.");
  return parsed.data;
}

export async function changeRole(req: Request, res: Response) {
  if (!req.ctx) throw new Error("changeRole requires requireOrgMembership to have run first");
  const parsed = updateMemberRoleRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError("validation_error", 400, "Invalid role", parsed.error.flatten().fieldErrors);
  }
  await organizationsService.changeMemberRole({
    organizationId: req.ctx.organizationId,
    actor: { userId: req.ctx.userId, role: req.ctx.role },
    targetUserId: targetUserId(req),
    role: parsed.data.role,
  });
  res.status(204).end();
}

export async function removeMember(req: Request, res: Response) {
  if (!req.ctx) throw new Error("removeMember requires requireOrgMembership to have run first");
  await organizationsService.removeMember({
    organizationId: req.ctx.organizationId,
    actor: { userId: req.ctx.userId, role: req.ctx.role },
    targetUserId: targetUserId(req),
  });
  res.status(204).end();
}
