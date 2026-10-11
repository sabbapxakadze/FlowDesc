import { draftImageResponseSchema } from "@flowdesk/contracts";
import { apiUpload } from "../../../shared/api/client";

/**
 * A picture pasted into the description of a NEW issue (ADR 0063): the issue does not exist yet, so it is uploaded as a draft of the project.
 * Creating the issue links it; one never used is deleted by the server after 24 hours.
 */
export function uploadDraftImage(organizationId: string, projectId: string, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return apiUpload(
    `/v1/organizations/${organizationId}/projects/${projectId}/draft-images`,
    formData,
    draftImageResponseSchema,
  ).then((res) => res.data);
}
