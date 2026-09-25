/**
 * G1: "the reporter attaches the last 50 messages as evidence, which is the only way a
 * human sees chat content." This is that snapshot — a pure transform from already-loaded
 * messages to the exact Json shape stored on `Report.evidence`, so the caller (actions.ts)
 * decides how to fetch the messages, and this decides only how many and in what shape.
 */
export const MAX_EVIDENCE_MESSAGES = 50;

export interface EvidenceMessage {
  senderId: string;
  text: string;
  createdAt: string;
}

export function buildEvidenceSnapshot(
  messages: { senderId: string; text: string; createdAt: Date }[],
): EvidenceMessage[] {
  return messages
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .slice(-MAX_EVIDENCE_MESSAGES)
    .map((m) => ({ senderId: m.senderId, text: m.text, createdAt: m.createdAt.toISOString() }));
}
