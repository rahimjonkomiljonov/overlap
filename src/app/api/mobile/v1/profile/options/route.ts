import { prisma } from "@/server/db";
import { profileOptions } from "@/server/mobile/profile-read";
import { mobileRoute } from "@/server/mobile/route";

/** The lists and limits the wizard screens are built from (departments, years, prompts, interests, values quiz, limits). */
export const GET = mobileRoute(
  "profile.options",
  () =>
    profileOptions({
      prompts: () =>
        prisma.prompt.findMany({
          where: { active: true },
          orderBy: { sortOrder: "asc" },
          select: { id: true, textKo: true, textEn: true },
        }),
      interests: () =>
        prisma.interestTag.findMany({
          where: { active: true },
          orderBy: [{ category: "asc" }, { labelEn: "asc" }],
          select: { id: true, labelKo: true, labelEn: true },
        }),
    }),
  { requireAccountSetup: true },
);
