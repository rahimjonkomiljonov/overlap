import { ReportCategory, ReportPriority } from "@/generated/prisma/enums";

/**
 * G1: non-consensual intimate images, deepfakes and illegal filming are always urgent;
 * every other category is standard. The one place this classification lives — kept as
 * pure code rather than admin-editable content, since the category list itself is fixed
 * enum membership (H5's content management doesn't cover this).
 */
const URGENT_CATEGORIES: ReadonlySet<ReportCategory> = new Set([
  ReportCategory.NON_CONSENSUAL_IMAGERY,
  ReportCategory.DEEPFAKE,
  ReportCategory.ILLEGAL_FILMING,
]);

export function isUrgentCategory(category: ReportCategory): boolean {
  return URGENT_CATEGORIES.has(category);
}

export function priorityForCategory(category: ReportCategory): ReportPriority {
  return isUrgentCategory(category) ? ReportPriority.URGENT : ReportPriority.STANDARD;
}
