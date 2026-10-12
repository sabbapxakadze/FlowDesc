import { throughputResponseSchema } from "@flowdesc/contracts";
import { apiGet } from "../../../shared/api/client";

export function fetchThroughput(organizationId: string, projectId: string, weeks: number) {
  return apiGet(
    `/v1/organizations/${organizationId}/projects/${projectId}/analytics/throughput?weeks=${weeks}`,
    throughputResponseSchema,
  ).then((res) => res.data);
}
