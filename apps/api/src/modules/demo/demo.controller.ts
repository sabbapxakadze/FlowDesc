import type { Request, Response } from "express";
import { authSessionSchema, demoInfoResponseSchema } from "@flowdesc/contracts";
import { setRefreshCookie } from "../auth/auth.controller.js";
import * as demoService from "./demo.service.js";

export function info(_req: Request, res: Response) {
  res.json(demoInfoResponseSchema.parse({ data: demoService.getInfo() }));
}

/** Answers like a login: an access token in the body, the refresh token in its cookie. */
export async function start(_req: Request, res: Response) {
  const { accessToken, refreshToken, user, organization } = await demoService.startDemo();
  setRefreshCookie(res, refreshToken);
  res.status(201).json(authSessionSchema.parse({ accessToken, user, organization }));
}
