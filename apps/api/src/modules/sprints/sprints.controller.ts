import type { Request, Response } from "express";
import {
  completeSprintRequestSchema,
  createSprintRequestSchema,
  createSprintResponseSchema,
  listSprintsResponseSchema,
  renameSprintRequestSchema,
  sprintResponseSchema,
  startSprintRequestSchema,
} from "@flowdesc/contracts";
import { AppError } from "../../shared/errors.js";
import * as sprintsService from "./sprints.service.js";

// Same Date -> ISO string conversion every other controller does.
function toWireFormat(row: { createdAt: Date; updatedAt: Date; [key: string]: unknown }) {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export async function listSprints(req: Request, res: Response) {
  if (!req.ctx?.projectId) {
    throw new Error("listSprints requires requireProject to have run first");
  }

  const rows = await sprintsService.listSprints(req.ctx.organizationId, req.ctx.projectId);
  const body = listSprintsResponseSchema.parse({ data: rows.map(toWireFormat) });
  res.json(body);
}

export async function createSprint(req: Request, res: Response) {
  if (!req.ctx?.projectId) {
    throw new Error("createSprint requires requireProject to have run first");
  }

  const parsed = createSprintRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError("validation_error", 400, "Invalid sprint details", parsed.error.flatten().fieldErrors);
  }

  const sprint = await sprintsService.createSprint({
    organizationId: req.ctx.organizationId,
    projectId: req.ctx.projectId,
    name: parsed.data.name,
    startDate: parsed.data.startDate ?? null,
    endDate: parsed.data.endDate ?? null,
  });

  const body = createSprintResponseSchema.parse({ data: toWireFormat(sprint) });
  res.status(201).json(body);
}

export async function startSprint(req: Request, res: Response) {
  if (!req.ctx?.projectId || !req.ctx.sprintId) {
    throw new Error("startSprint requires requireSprint to have run first");
  }

  const parsed = startSprintRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError("validation_error", 400, "Invalid request", parsed.error.flatten().fieldErrors);
  }

  const result = await sprintsService.startSprint({
    organizationId: req.ctx.organizationId,
    projectId: req.ctx.projectId,
    sprintId: req.ctx.sprintId,
    expectedVersion: parsed.data.version,
    actorId: req.ctx.userId,
  });

  if (result.status === "conflict") {
    throw new AppError(
      "version_conflict",
      409,
      "This sprint was changed by someone else since you loaded it.",
      undefined,
      { current: toWireFormat(result.current) },
    );
  }

  if (result.status === "not_found") {
    throw new AppError("sprint_not_found", 404, "Sprint not found.");
  }

  const body = sprintResponseSchema.parse({ data: toWireFormat(result.sprint) });
  res.json(body);
}

export async function completeSprint(req: Request, res: Response) {
  if (!req.ctx?.projectId || !req.ctx.sprintId) {
    throw new Error("completeSprint requires requireSprint to have run first");
  }

  const parsed = completeSprintRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError("validation_error", 400, "Invalid request", parsed.error.flatten().fieldErrors);
  }

  const result = await sprintsService.completeSprint({
    organizationId: req.ctx.organizationId,
    projectId: req.ctx.projectId,
    sprintId: req.ctx.sprintId,
    expectedVersion: parsed.data.version,
    actorId: req.ctx.userId,
  });

  if (result.status === "conflict") {
    throw new AppError(
      "version_conflict",
      409,
      "This sprint was changed by someone else since you loaded it.",
      undefined,
      { current: toWireFormat(result.current) },
    );
  }

  if (result.status === "not_found") {
    throw new AppError("sprint_not_found", 404, "Sprint not found.");
  }

  const body = sprintResponseSchema.parse({ data: toWireFormat(result.sprint) });
  res.json(body);
}

export async function renameSprint(req: Request, res: Response) {
  if (!req.ctx?.projectId || !req.ctx.sprintId) {
    throw new Error("renameSprint requires requireSprint to have run first");
  }

  const parsed = renameSprintRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError("validation_error", 400, "Invalid sprint name", parsed.error.flatten().fieldErrors);
  }

  const result = await sprintsService.renameSprint({
    organizationId: req.ctx.organizationId,
    projectId: req.ctx.projectId,
    sprintId: req.ctx.sprintId,
    expectedVersion: parsed.data.version,
    name: parsed.data.name,
    actorId: req.ctx.userId,
  });

  if (result.status === "conflict") {
    throw new AppError(
      "version_conflict",
      409,
      "This sprint was changed by someone else since you loaded it.",
      undefined,
      { current: toWireFormat(result.current) },
    );
  }

  if (result.status === "not_found") {
    throw new AppError("sprint_not_found", 404, "Sprint not found.");
  }

  res.json(sprintResponseSchema.parse({ data: toWireFormat(result.sprint) }));
}

export async function deleteSprint(req: Request, res: Response) {
  if (!req.ctx?.projectId || !req.ctx.sprintId) {
    throw new Error("deleteSprint requires requireSprint to have run first");
  }

  const result = await sprintsService.deleteSprint({
    organizationId: req.ctx.organizationId,
    projectId: req.ctx.projectId,
    sprintId: req.ctx.sprintId,
    actorId: req.ctx.userId,
  });

  if (result.status === "active") {
    throw new AppError("sprint_active", 409, "An active sprint cannot be deleted. Complete it first.");
  }
  if (result.status === "not_found") {
    throw new AppError("sprint_not_found", 404, "Sprint not found.");
  }

  res.status(204).end();
}
