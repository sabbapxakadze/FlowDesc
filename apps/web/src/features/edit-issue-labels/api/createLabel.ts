import { createLabelResponseSchema, type CreateLabelRequest } from "@flowdesc/contracts";
import { apiPost } from "../../../shared/api/client";

export function createLabel(organizationId: string, input: CreateLabelRequest) {
  return apiPost(`/v1/organizations/${organizationId}/labels`, input, createLabelResponseSchema).then(
    (res) => res.data,
  );
}
