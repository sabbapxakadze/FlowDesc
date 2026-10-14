import { Router, type Router as RouterType, type NextFunction, type Request, type Response } from "express";
import multer, { MulterError } from "multer";
import { BUG_REPORT_MAX_FILES, BUG_REPORT_MAX_FILE_BYTES } from "@flowdesc/contracts";
import { bugReportRateLimiter } from "../../middleware/rate-limit.js";
import { requireAuth } from "../../middleware/require-auth.js";
import { AppError } from "../../shared/errors.js";
import { denyInDemo } from "../demo/demo.guard.js";
import * as controller from "./bug-reports.controller.js";

export const bugReportsRouter: RouterType = Router();

// Memory storage: the pictures are only attached to one email, never saved. The real "is this a picture" check is on the bytes, in the service.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: BUG_REPORT_MAX_FILE_BYTES, files: BUG_REPORT_MAX_FILES },
});

// multer's own errors never reach the client raw (same rule as the attachment upload).
function parseScreenshots(req: Request, res: Response, next: NextFunction) {
  upload.array("screenshots", BUG_REPORT_MAX_FILES)(req, res, (err: unknown) => {
    if (err instanceof MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        next(new AppError("file_too_large", 400, `A screenshot can be at most ${BUG_REPORT_MAX_FILE_BYTES / (1024 * 1024)} MB.`));
      } else if (err.code === "LIMIT_UNEXPECTED_FILE" || err.code === "LIMIT_FILE_COUNT") {
        next(new AppError("too_many_files", 400, `You can attach at most ${BUG_REPORT_MAX_FILES} screenshots.`));
      } else {
        next(new AppError("upload_error", 400, err.message));
      }
      return;
    }
    next(err);
  });
}

// A signed-in session only: this address is not on the access-token list (middleware/token-access.ts), so a token cannot send reports.
// A demo copy cannot either: it sends email and carries uploads (ADR 0044). Who you are is checked, then the limit, then the upload is read.
bugReportsRouter.post("/bug-reports", requireAuth, denyInDemo("Reporting a bug"), bugReportRateLimiter, parseScreenshots, controller.create);
