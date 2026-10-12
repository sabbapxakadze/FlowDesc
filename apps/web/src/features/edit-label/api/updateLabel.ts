import { updateLabelResponseSchema, type UpdateLabelRequest } from "@flowdesc/contracts";
import { apiPatch } from "../../../shared/api/client";

export function updateLabel(
  organizationId: string,
  labelId: string,
  input: UpdateLabelRequest,
) {
  return apiPatch(
    `/v1/organizations/${organizationId}/labels/${labelId}`,
    input,
    updateLabelResponseSchema,
  ).then((res) => res.data);
}
