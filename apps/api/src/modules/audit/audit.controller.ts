import type { Request, Response } from "express";
import {
  AUDIT_EXPORT_MAX_ROWS,
  auditActionSchema,
  exportAuditEventsQuerySchema,
  listAuditEventsQuerySchema,
  listAuditEventsResponseSchema,
} from "@flowdesc/contracts";
import { AppError } from "../../shared/errors.js";
import { toCsv } from "../../shared/csv.js";
import * as auditRepository from "./audit.repository.js";

export async function list(req: Request, res: Response) {
  if (!req.ctx) {
    throw new Error("listAuditEvents requires requireOrgMembership to have run first");
  }
  const parsed = listAuditEventsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("validation_error", 400, "Invalid audit log query", parsed.error.flatten().fieldErrors);
  }

  const result = await auditRepository.list(req.ctx.organizationId, parsed.data);
  if (result.status === "invalid_cursor") {
    throw new AppError("invalid_cursor", 400, "Invalid pagination cursor.");
  }

  res.json(
    listAuditEventsResponseSchema.parse({
      data: result.items.map((row) => ({
        id: row.id,
        actorId: row.actorId,
        actorName: row.actorName,
        // A row whose action this version does not know cannot be shown meaningfully; fail
        // loudly here rather than hand the web app a shape it does not have.
        action: auditActionSchema.parse(row.action),
        targetType: row.targetType,
        targetLabel: row.targetLabel,
        details: row.details as Record<string, unknown>,
        createdAt: row.createdAt.toISOString(),
      })),
      nextCursor: result.nextCursor,
    }),
  );
}

/** The columns of an export, in order. Raw fields, not the sentence the web page writes: the sentence is the web app's wording. */
const EXPORT_HEADER = ["time", "who", "action", "target_type", "target", "details"];

/** Builds the CSV text for an export (separate from the route so it can be tested without HTTP). */
export function buildAuditCsv(
  rows: { createdAt: Date; actorName: string; action: string; targetType: string; targetLabel: string; details: unknown }[],
  truncated: boolean,
): string {
  const lines = rows.map((row) => [
    row.createdAt.toISOString(),
    row.actorName,
    row.action,
    row.targetType,
    row.targetLabel,
    JSON.stringify(row.details ?? {}),
  ]);
  if (truncated) {
    lines.push([`Only the newest ${AUDIT_EXPORT_MAX_ROWS} rows are included; narrow the filters to see older ones.`, "", "", "", "", ""]);
  }
  return toCsv([EXPORT_HEADER, ...lines]);
}

export async function exportCsv(req: Request, res: Response) {
  if (!req.ctx) {
    throw new Error("exportAuditEvents requires requireOrgMembership to have run first");
  }
  const parsed = exportAuditEventsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new AppError("validation_error", 400, "Invalid audit log query", parsed.error.flatten().fieldErrors);
  }

  const { items, truncated } = await auditRepository.listForExport(req.ctx.organizationId, parsed.data, AUDIT_EXPORT_MAX_ROWS);
  res
    .status(200)
    .type("text/csv; charset=utf-8")
    .set("Content-Disposition", `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`)
    .send(buildAuditCsv(items, truncated));
}
