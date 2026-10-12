import type { Request, Response } from "express";
import {
  breakdownResponseSchema,
  cycleTimeResponseSchema,
  sprintsQuerySchema,
  throughputResponseSchema,
  velocityResponseSchema,
  weeksQuerySchema,
} from "@flowdesc/contracts";
import { AppError } from "../../shared/errors.js";
import * as analyticsService from "./analytics.service.js";

// Both analytics endpoints take the same ?weeks= window; parse it once.
function parseWeeks(req: Request): number {
  const parsed = weeksQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("validation_error", 400, "Invalid analytics query", parsed.error.flatten().fieldErrors);
  }
  return parsed.data.weeks;
}

export async function getThroughput(req: Request, res: Response) {
  if (!req.ctx?.projectId) {
    throw new Error("getThroughput requires requireProject to have run first");
  }

  const rows = await analyticsService.getThroughput(req.ctx.organizationId, req.ctx.projectId, parseWeeks(req));
  res.json(throughputResponseSchema.parse({ data: rows }));
}

export async function getCycleTime(req: Request, res: Response) {
  if (!req.ctx?.projectId) {
    throw new Error("getCycleTime requires requireProject to have run first");
  }

  const result = await analyticsService.getCycleTime(req.ctx.organizationId, req.ctx.projectId, parseWeeks(req));
  res.json(cycleTimeResponseSchema.parse(result));
}

export async function getVelocity(req: Request, res: Response) {
  if (!req.ctx?.projectId) {
    throw new Error("getVelocity requires requireProject to have run first");
  }

  const parsed = sprintsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("validation_error", 400, "Invalid analytics query", parsed.error.flatten().fieldErrors);
  }

  const { averageCompleted, rows } = await analyticsService.getVelocity(
    req.ctx.organizationId,
    req.ctx.projectId,
    parsed.data.sprints,
  );
  res.json(
    velocityResponseSchema.parse({
      summary: { averageCompleted },
      data: rows.map((row) => ({ ...row, completedAt: new Date(row.completedAt).toISOString() })),
    }),
  );
}

export async function getBreakdown(req: Request, res: Response) {
  if (!req.ctx?.projectId) {
    throw new Error("getBreakdown requires requireProject to have run first");
  }

  const result = await analyticsService.getBreakdown(req.ctx.organizationId, req.ctx.projectId);
  res.json(breakdownResponseSchema.parse(result));
}
