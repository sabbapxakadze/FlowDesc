import { Router, type Router as RouterType } from "express";
import { requireAuth } from "../../middleware/require-auth.js";
import { denyInDemo } from "../demo/demo.guard.js";
import * as controller from "./api-tokens.controller.js";

export const apiTokensRouter: RouterType = Router();

// Managing tokens needs a real signed-in session: a token can never create, list or revoke tokens (middleware/token-access.ts
// does not allow these addresses), so a leaked token cannot mint a longer-lived sibling. Demo copies cannot make tokens (ADR 0044).
apiTokensRouter.post("/users/me/api-tokens", requireAuth, denyInDemo("Access tokens"), controller.create);
apiTokensRouter.get("/users/me/api-tokens", requireAuth, controller.list);
apiTokensRouter.delete("/users/me/api-tokens/:tokenId", requireAuth, controller.revoke);

// The one address here a token MAY call (it is on the allowlist): who am I, and which organization.
apiTokensRouter.get("/users/me/context", requireAuth, controller.context);
