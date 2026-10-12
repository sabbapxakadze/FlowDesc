import { Router, type Router as RouterType } from "express";
import { healthResponseSchema } from "@flowdesc/contracts";

/**
 * Not split into routes/controller/service/repository like a real domain
 * module (see CLAUDE.md) — there's no business logic or database access
 * here, so those layers would be empty ceremony. That pattern starts with
 * the first real feature in Phase 1.
 */
export const healthRouter: RouterType = Router();

healthRouter.get("/health", (_req, res) => {
  const body = healthResponseSchema.parse({
    status: "ok",
    service: "flowdesc-api",
    timestamp: new Date().toISOString(),
  });

  res.json(body);
});
