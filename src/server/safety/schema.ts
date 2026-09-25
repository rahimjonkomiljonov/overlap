import * as z from "zod";

export const BLOCK_REASON_MAX_LENGTH = 500;

export const hideByCourseSchema = z.object({ courseId: z.string().min(1) });
export const hideByClubSchema = z.object({ clubId: z.string().min(1) });
export const hideByEmailSchema = z.object({ email: z.string().trim().toLowerCase().email() });
export const unhideSchema = z.object({ hiddenUserId: z.string().min(1) });

export const blockUserSchema = z.object({
  targetUserId: z.string().min(1),
  reason: z.string().trim().max(BLOCK_REASON_MAX_LENGTH).optional(),
});
export const unblockUserSchema = z.object({ targetUserId: z.string().min(1) });

export const setPausedSchema = z.object({ paused: z.enum(["true", "false"]) });
export const setIncognitoSchema = z.object({ incognito: z.enum(["true", "false"]) });
