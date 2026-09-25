import type { PrismaClient } from "@/generated/prisma/client";
import { safetyResourcesSchema, type SafetyResources } from "@/server/reference/schemas";

export interface EmergencyContact {
  key: string;
  labelKo: string;
  labelEn: string;
  /** Null when the number is a known placeholder pending verification (G6: "verify all numbers before launch") — the UI must say so, never silently show a wrong or invented number. */
  phone: string | null;
  noteKo?: string;
  noteEn?: string;
}

/**
 * G6's national contacts — fixed code constants, not admin-editable content, since these
 * numbers don't vary by campus. `digitalSexCrime`'s number is intentionally left
 * unverified rather than guessed: this codebase's own /safety page (S13) already
 * described this center without asserting a phone number, and G6 explicitly calls for
 * verifying every number before launch.
 */
export const NATIONAL_EMERGENCY_CONTACTS: EmergencyContact[] = [
  { key: "police", labelKo: "경찰", labelEn: "Police", phone: "112" },
  { key: "ambulance", labelKo: "구급", labelEn: "Ambulance", phone: "119" },
  { key: "womenHotline", labelKo: "여성긴급전화", labelEn: "Women's Emergency Hotline", phone: "1366" },
  {
    key: "digitalSexCrime",
    labelKo: "디지털성범죄피해자지원센터",
    labelEn: "Digital Sex Crime Victim Support Center",
    phone: null,
    noteKo: "전화번호 확인 필요(출시 전 검증) — 우선 1366으로 연결하세요.",
    noteEn: "Phone number pending verification before launch — call 1366 in the meantime.",
  },
];

export type EmergencyDb = Pick<PrismaClient, "campus">;

/** Defensively re-validates the stored Json against the same schema the S06 importer writes with — a row this app didn't write itself should never crash the emergency card. */
export async function getCampusSafetyResources(db: EmergencyDb, campusId: string): Promise<SafetyResources | null> {
  const campus = await db.campus.findUnique({ where: { id: campusId }, select: { safetyResources: true } });
  const parsed = safetyResourcesSchema.safeParse(campus?.safetyResources ?? null);
  return parsed.success ? parsed.data : null;
}

/** National contacts plus whatever campus-specific ones are configured — the one call a page needs. */
export async function getEmergencyContacts(db: EmergencyDb, campusId: string): Promise<EmergencyContact[]> {
  const safetyResources = await getCampusSafetyResources(db, campusId);
  return [...NATIONAL_EMERGENCY_CONTACTS, ...getCampusEmergencyContacts(safetyResources)];
}

export function getCampusEmergencyContacts(safetyResources: SafetyResources | null): EmergencyContact[] {
  if (!safetyResources) return [];
  return [
    { key: "campusSecurity", labelKo: "캠퍼스 보안", labelEn: "Campus Security", phone: safetyResources.campusSecurityPhone },
    { key: "counselingCenter", labelKo: "상담센터", labelEn: "Counseling Center", phone: safetyResources.counselingCenterPhone },
    {
      key: "sexualViolenceCenter",
      labelKo: "성폭력·인권센터",
      labelEn: "Sexual Violence / Human Rights Center",
      phone: safetyResources.sexualViolenceCenterPhone,
      noteKo: safetyResources.sexualViolenceCenterHours,
      noteEn: safetyResources.sexualViolenceCenterHours,
    },
  ];
}
