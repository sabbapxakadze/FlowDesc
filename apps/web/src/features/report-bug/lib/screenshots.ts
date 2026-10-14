import { BUG_REPORT_IMAGE_TYPES, BUG_REPORT_MAX_FILES, BUG_REPORT_MAX_FILE_BYTES } from "@flowdesc/contracts";

/**
 * Which of the offered pictures can be added to a report, and a sentence for the first one that cannot (ADR 0075). The same limits the server
 * enforces (it also checks the bytes), checked here so the person hears about a problem before sending, not after.
 */
export function addScreenshots(current: File[], offered: File[]): { files: File[]; problem: string | null } {
  const files = [...current];
  let problem: string | null = null;
  for (const file of offered) {
    if (!(BUG_REPORT_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      problem ??= `${file.name || "That file"} is not a PNG, JPEG or WebP picture.`;
    } else if (file.size > BUG_REPORT_MAX_FILE_BYTES) {
      problem ??= `${file.name || "That picture"} is larger than ${BUG_REPORT_MAX_FILE_BYTES / (1024 * 1024)} MB.`;
    } else if (files.length >= BUG_REPORT_MAX_FILES) {
      problem ??= `You can attach at most ${BUG_REPORT_MAX_FILES} screenshots.`;
    } else {
      files.push(file);
    }
  }
  return { files, problem };
}
