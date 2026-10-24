import type { PrismaClient } from "@/generated/prisma/client";
import { VerificationDecision } from "@/generated/prisma/enums";
import type { UploadedFile } from "@/server/profile/photos-service";
import { newSelfieStorageKey, processSelfie, uploadSelfie } from "@/server/storage/selfies";
import type { ProcessedPhoto } from "@/server/storage/photos";

/**
 * Submitting a verification selfie (A4), shared by the website's server action and the mobile API.
 * One selfie waits for review at a time. A selfie is private to the person and the moderator who
 * reviews it: it is never shown to other users and is deleted within 7 days of the decision.
 */
export type SelfieDb = Pick<PrismaClient, "selfie">;

export type SelfieStorage = {
  process: (input: Buffer) => Promise<ProcessedPhoto>;
  newKey: (userId: string) => string;
  upload: (key: string, bytes: Buffer) => Promise<void>;
};

export const defaultSelfieStorage: SelfieStorage = {
  process: processSelfie,
  newKey: newSelfieStorageKey,
  upload: uploadSelfie,
};

export type SubmitSelfieError =
  "INVALID_INPUT" | "FILE_TOO_LARGE" | "INVALID_FILE_TYPE" | "ALREADY_PENDING";
export type SubmitSelfieResult =
  { status: "success" } | { status: "error"; code: SubmitSelfieError };

export async function submitSelfieStep(
  db: SelfieDb,
  person: { userId: string },
  file: UploadedFile,
  maxBytes: number,
  storage: SelfieStorage = defaultSelfieStorage,
): Promise<SubmitSelfieResult> {
  if (file.size === 0) return { status: "error", code: "INVALID_INPUT" };
  if (file.size > maxBytes) return { status: "error", code: "FILE_TOO_LARGE" };
  if (!file.type.startsWith("image/")) return { status: "error", code: "INVALID_FILE_TYPE" };

  const pending = await db.selfie.findFirst({
    where: { userId: person.userId, decision: VerificationDecision.PENDING },
    select: { id: true },
  });
  if (pending) return { status: "error", code: "ALREADY_PENDING" };

  let processed: ProcessedPhoto;
  try {
    processed = await storage.process(await file.bytes());
  } catch {
    return { status: "error", code: "INVALID_FILE_TYPE" };
  }

  const storageKey = storage.newKey(person.userId);
  await storage.upload(storageKey, processed.bytes);
  await db.selfie.create({ data: { userId: person.userId, storageKey } });
  return { status: "success" };
}
