import { describe, expect, it } from "vitest";
import { getCampusEmergencyContacts, NATIONAL_EMERGENCY_CONTACTS } from "./emergency";

describe("NATIONAL_EMERGENCY_CONTACTS", () => {
  it("includes police, ambulance and the women's hotline with real numbers", () => {
    const byKey = Object.fromEntries(NATIONAL_EMERGENCY_CONTACTS.map((c) => [c.key, c.phone]));
    expect(byKey.police).toBe("112");
    expect(byKey.ambulance).toBe("119");
    expect(byKey.womenHotline).toBe("1366");
  });

  it("marks the digital sex-crime center's number as unverified rather than guessing one (G6)", () => {
    const entry = NATIONAL_EMERGENCY_CONTACTS.find((c) => c.key === "digitalSexCrime");
    expect(entry?.phone).toBeNull();
    expect(entry?.noteKo).toBeTruthy();
  });
});

describe("getCampusEmergencyContacts", () => {
  it("returns nothing when the campus has no configured safety resources", () => {
    expect(getCampusEmergencyContacts(null)).toEqual([]);
  });

  it("maps campus security, counseling and sexual-violence-center contacts", () => {
    const contacts = getCampusEmergencyContacts({
      campusSecurityPhone: "02-1111-2222",
      counselingCenterPhone: "02-3333-4444",
      sexualViolenceCenterPhone: "02-5555-6666",
      sexualViolenceCenterHours: "평일 9-18시",
    });
    expect(contacts.map((c) => c.phone)).toEqual(["02-1111-2222", "02-3333-4444", "02-5555-6666"]);
    expect(contacts.find((c) => c.key === "sexualViolenceCenter")?.noteKo).toBe("평일 9-18시");
  });
});
