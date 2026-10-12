import { listLabelsResponseSchema } from "@flowdesc/contracts";
import { apiGet } from "../../../shared/api/client";

export function fetchLabels(organizationId: string) {
  return apiGet(`/v1/organizations/${organizationId}/labels`, listLabelsResponseSchema).then(
    (res) => res.data,
  );
}
