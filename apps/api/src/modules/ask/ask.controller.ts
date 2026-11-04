import type { Request, Response } from "express";
import { ASK_MAX_QUESTION, askInfoResponseSchema, askRequestSchema, askResponseSchema } from "@flowdesc/contracts";
import { getAiProvider } from "../../lib/ai-provider.js";
import { AppError } from "../../shared/errors.js";
import * as service from "./ask.service.js";

export function info(_req: Request, res: Response) {
  res.json(askInfoResponseSchema.parse({ data: { enabled: getAiProvider() !== undefined, maxQuestionLength: ASK_MAX_QUESTION } }));
}

export async function ask(req: Request, res: Response) {
  if (!req.ctx) throw new Error("ask requires requireOrgMembership to have run first");

  const parsed = askRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError("validation_error", 400, "Invalid question", parsed.error.flatten().fieldErrors);
  }

  // If the person closes the page before the answer is ready, the call to the model is cancelled too.
  const cancel = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) cancel.abort();
  });

  const result = await service.ask({ organizationId: req.ctx.organizationId, userId: req.ctx.userId, question: parsed.data.question, signal: cancel.signal });
  res.json(askResponseSchema.parse({ data: result }));
}
