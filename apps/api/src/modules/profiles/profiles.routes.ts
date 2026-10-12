import { Router, type Router as RouterType, type NextFunction, type Request, type Response } from "express";
import multer, { MulterError } from "multer";
import { AVATAR_MAX_BYTES, AVATAR_MIME_TYPES } from "@flowdesc/contracts";
import { requireAuth } from "../../middleware/require-auth.js";
import { requireOrgMembership } from "../../middleware/require-org-membership.js";
import { AppError } from "../../shared/errors.js";
import { denyInDemo } from "../demo/demo.guard.js";
import * as profilesController from "./profiles.controller.js";

export const profilesRouter: RouterType = Router();

// The MIME check here is only an early, cheap refusal; the real validation is decoding the bytes
// (lib/image.ts), because the type is whatever the client claims.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: AVATAR_MAX_BYTES },
  fileFilter(_req, file, cb) {
    if (!(AVATAR_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
      cb(new AppError("invalid_image", 400, "The photo must be a PNG, JPEG or WebP picture."));
      return;
    }
    cb(null, true);
  },
});

function parseAvatarUpload(req: Request, res: Response, next: NextFunction) {
  upload.single("file")(req, res, (err: unknown) => {
    if (err instanceof AppError) {
      next(err);
      return;
    }
    if (err instanceof MulterError) {
      next(
        err.code === "LIMIT_FILE_SIZE"
          ? new AppError("file_too_large", 400, "The photo must be 5 MB or smaller.")
          : new AppError("upload_error", 400, err.message),
      );
      return;
    }
    next(err);
  });
}

profilesRouter.patch("/users/me/profile", requireAuth, profilesController.updateMine);
profilesRouter.put("/users/me/avatar", requireAuth, denyInDemo("Uploading a photo"), parseAvatarUpload, profilesController.uploadAvatar);
profilesRouter.delete("/users/me/avatar", requireAuth, profilesController.removeAvatar);
profilesRouter.get("/users/me/profile-nudge", requireAuth, profilesController.getNudge);
profilesRouter.post("/users/me/profile-nudge/dismiss", requireAuth, profilesController.dismissNudge);
profilesRouter.get("/users/me/tour", requireAuth, profilesController.getTour);
profilesRouter.post("/users/me/tour/seen", requireAuth, profilesController.markTourSeen);

profilesRouter.get(
  "/organizations/:organizationId/members/:userId/profile",
  requireAuth,
  requireOrgMembership,
  profilesController.getProfile,
);
profilesRouter.get(
  "/organizations/:organizationId/members/:userId/activity",
  requireAuth,
  requireOrgMembership,
  profilesController.getActivity,
);

profilesRouter.get("/avatars/:key", profilesController.serveAvatar);
