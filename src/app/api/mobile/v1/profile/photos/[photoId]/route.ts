import { prisma } from "@/server/db";
import { removePhotoStep } from "@/server/profile/photos-service";
import { mobileRoute } from "@/server/mobile/route";
import { photoDeleteHandler } from "@/server/mobile/uploads";

/** Removes one of your own photos. Someone else's photo looks exactly like one that does not exist. */
export const DELETE = mobileRoute(
  "profile.photos.remove",
  (context) =>
    photoDeleteHandler(context, {
      remove: (person, photoId) => removePhotoStep(prisma, person, photoId),
    }),
  { requireAccountSetup: true },
);
