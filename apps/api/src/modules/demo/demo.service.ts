import { env } from "../../config/env.js";
import { createDemoCopy } from "../../db/seed-demo.js";
import { logger } from "../../lib/logger.js";
import { AppError } from "../../shared/errors.js";
import * as authRepository from "../auth/auth.repository.js";
import { startSessionFor } from "../auth/auth.service.js";
import * as demoRepository from "./demo.repository.js";

const isEnabled = () => env.DEMO_ENABLED === "true";

export function getInfo() {
  return { enabled: isEnabled(), ttlMinutes: env.DEMO_TTL_MINUTES };
}

/**
 * "Try the demo" (ADR 0044): a private copy of the demo organization for one visitor, and a session as its owner.
 *  1. Off unless DEMO_ENABLED=true (a deploy that never decided exposes nothing).
 *  2. Demos whose time is up are deleted first: cleanup happens when someone starts a new one, no scheduler needed yet.
 *  3. If DEMO_MAX_ACTIVE copies are alive, say so instead of making another. (A soft cap: requests arriving in the same instant can
 *     overshoot it by a few; the rate limit keeps that small.)
 *  4. Build the copy (it expires DEMO_TTL_MINUTES from now) and sign the visitor in as its owner, the way a login does.
 *  Each start that gets this far is counted (ADR 0076): `started`, or `busy` when step 3 refused. The count is a statistic, so a failure to
 *  write it is logged and never stops the demo.
 */
export async function startDemo() {
  if (!isEnabled()) throw new AppError("demo_disabled", 404, "The demo is not available.");

  await demoRepository.deleteExpiredDemos(new Date());
  if ((await demoRepository.countLiveDemos(new Date())) >= env.DEMO_MAX_ACTIVE) {
    await countStart("busy");
    throw new AppError("demo_busy", 503, "The demo is busy right now. Please try again in a few minutes.");
  }

  const { ownerId } = await createDemoCopy(new Date(Date.now() + env.DEMO_TTL_MINUTES * 60_000));
  const owner = await authRepository.findUserById(ownerId);
  if (!owner) throw new Error("The demo owner was not found right after it was created");
  const session = await startSessionFor(owner);
  await countStart("started");
  return session;
}

async function countStart(outcome: "started" | "busy"): Promise<void> {
  try {
    await demoRepository.recordStart(outcome);
  } catch (err) {
    logger.warn({ err, outcome }, "could not count a demo start");
  }
}
