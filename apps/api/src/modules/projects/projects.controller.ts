import type { Request, Response } from "express";
import {
  createProjectRequestSchema,
  createProjectResponseSchema,
  deleteProjectRequestSchema,
  listProjectsResponseSchema,
  listProjectSummariesResponseSchema,
  projectSummaryQuerySchema,
  updateProjectRequestSchema,
  updateProjectResponseSchema,
} from "@flowdesc/contracts";
import { AppError } from "../../shared/errors.js";
import * as projectsService from "./projects.service.js";

// Drizzle returns Date objects for timestamp columns; the wire format is
// ISO strings (see packages/contracts) — this is where that conversion
// belongs, since shaping the response is the controller's job.
function toWireFormat(row: { createdAt: Date; updatedAt: Date; [key: string]: unknown }) {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

/**
 * organizationId no longer comes from req.params directly — req.ctx is
 * set by requireOrgMembership (see middleware/require-org-membership.ts)
 * only once a real membership row was found. This is the actual fix for
 * the old "hardcoded org id" gap: the URL can say anything, but data only
 * ever comes back for an org req.ctx confirms the caller belongs to.
 */
export async function listProjects(req: Request, res: Response) {
  if (!req.ctx) {
    throw new Error("listProjects requires requireOrgMembership to have run first");
  }

  const rows = await projectsService.listProjects(req.ctx.organizationId);
  const body = listProjectsResponseSchema.parse({ data: rows.map(toWireFormat) });
  res.json(body);
}

export async function createProject(req: Request, res: Response) {
  if (!req.ctx) {
    throw new Error("createProject requires requireOrgMembership to have run first");
  }

  const parsed = createProjectRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(
      "validation_error",
      400,
      "Invalid project details",
      parsed.error.flatten().fieldErrors,
    );
  }

  const project = await projectsService.createProject({
    organizationId: req.ctx.organizationId,
    name: parsed.data.name,
    key: parsed.data.key,
    actorId: req.ctx.userId,
  });

  const body = createProjectResponseSchema.parse({ data: toWireFormat(project) });
  res.status(201).json(body);
}

export async function updateProject(req: Request, res: Response) {
  if (!req.ctx?.projectId) {
    throw new Error("updateProject requires requireProject to have run first");
  }

  const parsed = updateProjectRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(
      "validation_error",
      400,
      "Invalid project details",
      parsed.error.flatten().fieldErrors,
    );
  }

  const project = await projectsService.renameProject({
    organizationId: req.ctx.organizationId,
    projectId: req.ctx.projectId,
    name: parsed.data.name,
    actorId: req.ctx.userId,
  });
  if (!project) {
    throw new AppError("project_not_found", 404, "Project not found.");
  }

  res.json(updateProjectResponseSchema.parse({ data: toWireFormat(project) }));
}

export async function deleteProject(req: Request, res: Response) {
  if (!req.ctx?.projectId) {
    throw new Error("deleteProject requires requireProject to have run first");
  }

  const parsed = deleteProjectRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(
      "validation_error",
      400,
      "Type the project's name to confirm.",
      parsed.error.flatten().fieldErrors,
    );
  }

  const result = await projectsService.deleteProject({
    organizationId: req.ctx.organizationId,
    projectId: req.ctx.projectId,
    confirmName: parsed.data.confirmName,
    actorId: req.ctx.userId,
  });

  if (result.status === "not_found") {
    throw new AppError("project_not_found", 404, "Project not found.");
  }
  if (result.status === "confirmation_mismatch") {
    throw new AppError(
      "confirmation_mismatch",
      400,
      "The name you typed does not match this project's name.",
    );
  }

  res.status(204).end();
}

export async function listSummaries(req: Request, res: Response) {
  if (!req.ctx) {
    throw new Error("listSummaries requires requireOrgMembership to have run first");
  }
  const parsed = projectSummaryQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("validation_error", 400, "Invalid query", parsed.error.flatten().fieldErrors);
  }
  const rows = await projectsService.listSummaries(req.ctx.organizationId, parsed.data.today);
  res.json(
    listProjectSummariesResponseSchema.parse({
      data: rows.map((row) => ({ ...row, lastChangeAt: row.lastChangeAt ? row.lastChangeAt.toISOString() : null })),
    }),
  );
}
