import * as z from "zod";
import { ModerationActionType, ReportCategory } from "@/generated/prisma/enums";

export const REPORT_DESCRIPTION_MAX_LENGTH = 500;
export const MODERATION_REASON_MAX_LENGTH = 1000;
export const APPEAL_NOTE_MAX_LENGTH = 1000;

/** G1: 2-tap report. `conversationId` is only present when filed from an open chat thread — the one path that lets the reporter attach evidence. */
export const fileReportSchema = z.object({
  targetUserId: z.string().min(1),
  category: z.enum(ReportCategory),
  description: z.string().trim().max(REPORT_DESCRIPTION_MAX_LENGTH).optional(),
  conversationId: z.string().min(1).optional(),
});

/** H1/G8: every action needs a stated reason — enforced here (min 1), not left optional. */
export const moderationActionSchema = z.object({
  reportId: z.string().min(1),
  type: z.enum(ModerationActionType),
  reason: z.string().trim().min(1).max(MODERATION_REASON_MAX_LENGTH),
});

/** PIPA Art. 37-2: the affected user's one-time appeal note on a moderator action taken against them. */
export const appealSchema = z.object({
  moderationActionId: z.string().min(1),
  appealNote: z.string().trim().min(1).max(APPEAL_NOTE_MAX_LENGTH),
});
