import type { Request, Response } from "express";
import { z } from "zod";
import { listNotificationsResponseSchema, unreadCountResponseSchema } from "@flowdesc/contracts";
import { AppError } from "../../shared/errors.js";
import * as notificationsService from "./notifications.service.js";

// Flat join row (see notifications.repository.ts's notificationColumns)
// reshaped into the nested { event: {...} } wire shape notificationSchema
// expects — same "controllers format the response" job toWireFormat
// does elsewhere, just also nesting here instead of only ISO-stringing
// dates.
function toWireFormat(row: {
  id: string;
  readAt: Date | null;
  eventId: string;
  eventActorId: string;
  eventActorName: string;
  eventType: string;
  eventPayload: unknown;
  eventCreatedAt: Date;
  issueId: string;
  issueTitle: string;
  issueNumber: number;
  projectId: string;
  projectKey: string;
}) {
  return {
    id: row.id,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    issueId: row.issueId,
    issueTitle: row.issueTitle,
    issueNumber: row.issueNumber,
    projectId: row.projectId,
    projectKey: row.projectKey,
    event: {
      id: row.eventId,
      issueId: row.issueId,
      actorId: row.eventActorId,
      actorName: row.eventActorName,
      type: row.eventType,
      payload: row.eventPayload,
      createdAt: row.eventCreatedAt.toISOString(),
    },
  };
}

export async function listNotifications(req: Request, res: Response) {
  if (!req.ctx) {
    throw new Error("listNotifications requires requireOrgMembership to have run first");
  }

  const rows = await notificationsService.listNotifications(req.ctx.organizationId, req.ctx.userId);
  const body = listNotificationsResponseSchema.parse({ data: rows.map(toWireFormat) });
  res.json(body);
}

export async function getUnreadCount(req: Request, res: Response) {
  if (!req.ctx) {
    throw new Error("getUnreadCount requires requireOrgMembership to have run first");
  }

  const count = await notificationsService.getUnreadCount(req.ctx.organizationId, req.ctx.userId);
  const body = unreadCountResponseSchema.parse({ count });
  res.json(body);
}

const notificationIdSchema = z.uuid();

export async function markRead(req: Request, res: Response) {
  if (!req.ctx) {
    throw new Error("markRead requires requireOrgMembership to have run first");
  }

  const parsed = notificationIdSchema.safeParse(req.params.notificationId);
  if (!parsed.success) {
    throw new AppError("invalid_notification_id", 400, "notificationId must be a UUID.");
  }

  const result = await notificationsService.markNotificationRead(req.ctx.userId, parsed.data);
  if (result.status === "not_found") {
    throw new AppError("notification_not_found", 404, "Notification not found.");
  }

  res.status(204).end();
}

export async function markAllRead(req: Request, res: Response) {
  if (!req.ctx) {
    throw new Error("markAllRead requires requireOrgMembership to have run first");
  }

  await notificationsService.markAllNotificationsRead(req.ctx.organizationId, req.ctx.userId);
  res.status(204).end();
}
