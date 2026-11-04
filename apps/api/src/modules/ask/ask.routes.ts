import { Router, type Router as RouterType } from "express";
import { askAddressRateLimiter } from "../../middleware/rate-limit.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireOrgMembership } from "../../middleware/require-org-membership.js";
import { requirePermission } from "../../middleware/require-permission.js";
import * as controller from "./ask.controller.js";

export const askRouter: RouterType = Router();

// Public, like the demo's info: only whether Ask is switched on, so the panel can hide itself when it is not.
askRouter.get("/ask/info", controller.info);

// A signed-in session of a member who may read issues (a viewer may ask about what they can read). NOT on the access-token list
// (middleware/token-access.ts), so a token cannot call it. The demo may use it, with its own lower limits (ADR 0077, decision 9).
askRouter.post("/organizations/:organizationId/ask", requireAuth, requireOrgMembership, requirePermission("view_issue"), askAddressRateLimiter, controller.ask);
