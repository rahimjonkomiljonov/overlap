import { ReportPriority } from "@/generated/prisma/enums";

/** H1: urgent < 2h, standard < 24h, measured in plain elapsed time from filing — not a calendar-day boundary, so no Seoul-timezone math is needed here. */
const URGENT_SLA_MS = 2 * 60 * 60 * 1000;
const STANDARD_SLA_MS = 24 * 60 * 60 * 1000;

export function slaWindowMs(priority: ReportPriority): number {
  return priority === ReportPriority.URGENT ? URGENT_SLA_MS : STANDARD_SLA_MS;
}

export function slaDeadline(priority: ReportPriority, createdAt: Date): Date {
  return new Date(createdAt.getTime() + slaWindowMs(priority));
}

export function isOverdue(priority: ReportPriority, createdAt: Date, now: Date): boolean {
  return now.getTime() >= slaDeadline(priority, createdAt).getTime();
}
