import type { Request, Response } from "express";
import { createBugReportRequestSchema } from "@flowdesc/contracts";
import { logger } from "../../lib/logger.js";
import { AppError } from "../../shared/errors.js";
import * as service from "./bug-reports.service.js";

export async function create(req: Request, res: Response) {
  if (!req.auth) throw new Error("bug-reports routes require requireAuth to have run first");
  const parsed = createBugReportRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError("validation_error", 400, "Invalid bug report", parsed.error.flatten().fieldErrors);
  }
  const files = Array.isArray(req.files) ? req.files : [];
  await service.send({
    userId: req.auth.userId,
    report: parsed.data,
    userAgent: req.headers["user-agent"],
    files: files.map((file) => ({ buffer: file.buffer })),
  });
  // Only that a report was sent, never its text or pictures.
  logger.info({ userId: req.auth.userId, screenshots: files.length }, "bug report sent");
  res.status(201).json({ data: { sent: true } });
}
