import type { Request, Response } from "express";
import {
  createLabelRequestSchema,
  createLabelResponseSchema,
  listLabelsResponseSchema,
  updateLabelRequestSchema,
  updateLabelResponseSchema,
} from "@flowdesc/contracts";
import { z } from "zod";
import { AppError } from "../../shared/errors.js";
import * as labelsService from "./labels.service.js";

function toWireFormat(row: { createdAt: Date; updatedAt: Date; [key: string]: unknown }) {
  return { ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}

export async function listLabels(req: Request, res: Response) {
  if (!req.ctx) {
    throw new Error("listLabels requires requireOrgMembership to have run first");
  }

  const rows = await labelsService.listLabels(req.ctx.organizationId);
  const body = listLabelsResponseSchema.parse({ data: rows.map(toWireFormat) });
  res.json(body);
}

export async function createLabel(req: Request, res: Response) {
  if (!req.ctx) {
    throw new Error("createLabel requires requireOrgMembership to have run first");
  }

  const parsed = createLabelRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(
      "validation_error",
      400,
      "Invalid label details",
      parsed.error.flatten().fieldErrors,
    );
  }

  const label = await labelsService.createLabel({
    organizationId: req.ctx.organizationId,
    name: parsed.data.name,
    color: parsed.data.color,
  });

  const body = createLabelResponseSchema.parse({ data: toWireFormat(label) });
  res.status(201).json(body);
}

export async function updateLabel(req: Request, res: Response) {
  if (!req.ctx) {
    throw new Error("updateLabel requires requireOrgMembership to have run first");
  }

  const labelId = z.uuid().safeParse(req.params.labelId);
  if (!labelId.success) {
    throw new AppError("invalid_label_id", 400, "labelId must be a UUID.");
  }

  const parsed = updateLabelRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(
      "validation_error",
      400,
      "Invalid label details",
      parsed.error.flatten().fieldErrors,
    );
  }

  const label = await labelsService.updateLabel({
    organizationId: req.ctx.organizationId,
    labelId: labelId.data,
    changes: parsed.data,
    actorId: req.ctx.userId,
  });
  if (!label) {
    throw new AppError("label_not_found", 404, "Label not found.");
  }

  res.json(updateLabelResponseSchema.parse({ data: toWireFormat(label) }));
}

export async function deleteLabel(req: Request, res: Response) {
  if (!req.ctx) {
    throw new Error("deleteLabel requires requireOrgMembership to have run first");
  }

  const labelId = z.uuid().safeParse(req.params.labelId);
  if (!labelId.success) {
    throw new AppError("invalid_label_id", 400, "labelId must be a UUID.");
  }

  const deleted = await labelsService.deleteLabel({
    organizationId: req.ctx.organizationId,
    labelId: labelId.data,
    actorId: req.ctx.userId,
  });
  if (!deleted) {
    throw new AppError("label_not_found", 404, "Label not found.");
  }

  res.status(204).end();
}
