import { prisma } from "@/server/db";
import { enforceRateLimit } from "@/server/mobile/rate-limit";
import { mobileRoute } from "@/server/mobile/route";
import { POCKETS_VISIBLE_RATE_LIMIT, setPocketsVisibleHandler } from "@/server/mobile/pockets";

/** C7's opt-in: off by default, and only visible people can browse pockets. */
export const PUT = mobileRoute(
  "pockets.setVisible",
  (context) =>
    setPocketsVisibleHandler(context, {
      limit: (key) => enforceRateLimit(prisma, key, POCKETS_VISIBLE_RATE_LIMIT),
      setVisible: (person, visible) =>
        prisma.profile
          .update({ where: { userId: person.userId }, data: { pocketsVisible: visible } })
          .then(() => undefined),
    }),
  { requireAccountSetup: true },
);
