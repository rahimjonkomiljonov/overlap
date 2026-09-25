import * as z from "zod";
import { MeetupFeedbackResponse } from "@/generated/prisma/enums";

export const proposeMeetupSchema = z.object({
  matchId: z.string().min(1),
  spotId: z.string().min(1),
  day: z.coerce.number().int().min(0).max(6),
  block: z.coerce.number().int().min(0).max(11),
});

export const respondToMeetupSchema = z.object({
  proposalId: z.string().min(1),
  decision: z.enum(["ACCEPT", "DECLINE"]),
});

export const cancelMeetupSchema = z.object({
  proposalId: z.string().min(1),
});

export const submitMeetupFeedbackSchema = z.object({
  proposalId: z.string().min(1),
  response: z.enum(MeetupFeedbackResponse),
});

export const createShareLinkSchema = z.object({
  proposalId: z.string().min(1),
});

export const revokeShareLinkSchema = z.object({
  linkId: z.string().min(1),
});
