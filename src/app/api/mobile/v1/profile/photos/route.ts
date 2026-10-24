import { prisma } from "@/server/db";
import { addPhotoStep } from "@/server/profile/photos-service";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { mobileRoute } from "@/server/mobile/route";
import { PHOTO_RATE_LIMIT, photoUploadHandler } from "@/server/mobile/uploads";

/** Adds one profile photo (multipart field "photo"). Resized and stripped of metadata before it is stored. */
export const POST = mobileRoute(
  "profile.photos.add",
  (context) =>
    photoUploadHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, PHOTO_RATE_LIMIT),
      add: (person, file, maxBytes) => addPhotoStep(prisma, person, file, maxBytes),
    }),
  { requireAccountSetup: true },
);
