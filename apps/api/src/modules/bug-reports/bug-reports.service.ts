import type { CreateBugReportRequest } from "@flowdesc/contracts";
import { env } from "../../config/env.js";
import { sendBugReportEmail } from "../../lib/email.js";
import { AppError } from "../../shared/errors.js";
import * as authRepository from "../auth/auth.repository.js";
import * as organizationsRepository from "../organizations/organizations.repository.js";
import { imageKind } from "./image-kind.js";

/**
 * Sends a bug report to the owner by email (ADR 0075). Nothing is stored. Who is reporting comes from the database, never from the request;
 * each file must really be a PNG, JPEG or WebP (by its bytes) and is re-named, so a sender's file name never reaches the email; and a send
 * the provider refused is an error the person sees, because a report that quietly vanished is worse than none.
 */
export async function send(input: {
  userId: string;
  report: CreateBugReportRequest;
  userAgent: string | undefined;
  files: { buffer: Buffer }[];
}): Promise<void> {
  const attachments = input.files.map((file, index) => {
    const kind = imageKind(file.buffer);
    if (!kind) {
      throw new AppError("unsupported_file_type", 400, "Screenshots must be PNG, JPEG or WebP pictures.");
    }
    return { filename: `screenshot-${index + 1}.${kind.extension}`, content: file.buffer };
  });

  const [user, organization] = await Promise.all([
    authRepository.findUserById(input.userId),
    organizationsRepository.findPrimaryOrganizationForUser(input.userId),
  ]);
  if (!user) throw new AppError("unauthenticated", 401, "Your session is no longer valid. Please log in again.");

  const sent = await sendBugReportEmail({
    to: env.BUG_REPORT_TO ?? env.EMAIL_FROM,
    reporter: { name: user.name, email: user.email, organizationName: organization?.name ?? "none" },
    description: input.report.description,
    page: input.report.page,
    viewport: input.report.viewport,
    userAgent: input.userAgent?.slice(0, 300),
    attachments,
  });
  if (!sent) {
    throw new AppError("report_not_sent", 502, "We could not send your report. Please try again, or write to support@flowdesc.app.");
  }
}
