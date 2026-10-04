import * as z from "zod";

export const createEventSchema = z.object({
  title: z.string().trim().min(2).max(80),
  description: z.string().trim().min(1).max(1000),
  spotId: z.uuid(),
  startsAt: z.string(),
  endsAt: z.string(),
  // Empty field = no limit.
  capacity: z.preprocess(
    (v) => (v === "" || v == null ? undefined : v),
    z.coerce.number().int().min(2).max(1000).optional(),
  ),
});

export const rsvpSchema = z.object({
  eventId: z.uuid(),
  going: z.enum(["yes", "no"]),
  // A checked checkbox submits "on"; unchecked omits the field.
  showInGuestList: z.literal("on").optional(),
});

export const connectSchema = z.object({
  eventId: z.uuid(),
  // User ids come from Better Auth (32-char alphanumeric), not Prisma uuid().
  toUserId: z.string().min(1).max(64),
});
