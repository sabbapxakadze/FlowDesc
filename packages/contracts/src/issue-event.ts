import { z } from "zod";

/**
 * payload is free-form jsonb, shaped differently per event type (see
 * apps/api/src/modules/issues/issues.repository.ts's writers) — the
 * contract's job is the envelope, not every possible payload shape.
 */
export const issueEventSchema = z.object({
  id: z.uuid(),
  issueId: z.uuid(),
  actorId: z.uuid(),
  actorName: z.string(),
  type: z.string(),
  payload: z.record(z.string(), z.unknown()),
  // True when the change was made through a personal access token (ADR 0074). Never says which token.
  viaToken: z.boolean(),
  createdAt: z.iso.datetime(),
});

export type IssueEvent = z.infer<typeof issueEventSchema>;

export const listIssueEventsResponseSchema = z.object({
  data: z.array(issueEventSchema),
});

export type ListIssueEventsResponse = z.infer<typeof listIssueEventsResponseSchema>;
