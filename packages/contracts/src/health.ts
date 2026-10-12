import { z } from "zod";

/**
 * Response shape for GET /api/health.
 *
 * This is the smallest possible proof that a single Zod schema can be the
 * source of truth on both sides of the stack: the API validates its own
 * response against it, and the web app infers its TypeScript type from the
 * same definition. Neither side hand-writes a duplicate type. See
 * docs/adr/0002-shared-zod-contracts.md.
 */
export const healthResponseSchema = z.object({
  status: z.literal("ok"),
  service: z.literal("flowdesc-api"),
  timestamp: z.iso.datetime(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
