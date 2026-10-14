import { z } from "zod";
import { issueEventSchema } from "./issue-event.js";

/**
 * Nests the existing issueEventSchema rather than duplicating its
 * type/payload/actorName/createdAt fields — a notification IS an event
 * plus "does this recipient care and have they seen it", not a
 * separate shape. issueTitle/issueNumber/projectId/projectKey are the
 * extra context the per-issue timeline never needed (you're already on
 * that issue's page there) but a cross-issue feed does.
 */
export const notificationSchema = z.object({
  id: z.uuid(),
  // Without `viaToken` (ADR 0074): the feed does not show it and the notifications read does not select it. Requiring it here made this
  // endpoint answer 500, because the controller checks its own response against this schema.
  event: issueEventSchema.omit({ viaToken: true }),
  issueId: z.uuid(),
  issueTitle: z.string(),
  issueNumber: z.number(),
  projectId: z.uuid(),
  projectKey: z.string(),
  readAt: z.iso.datetime().nullable(),
});

export type Notification = z.infer<typeof notificationSchema>;

export const listNotificationsResponseSchema = z.object({
  data: z.array(notificationSchema),
});

export type ListNotificationsResponse = z.infer<typeof listNotificationsResponseSchema>;

export const unreadCountResponseSchema = z.object({
  count: z.number(),
});

export type UnreadCountResponse = z.infer<typeof unreadCountResponseSchema>;
