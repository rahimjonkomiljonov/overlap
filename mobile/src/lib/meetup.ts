import { apiGet, apiPost, apiPostOnce } from './api';
import { localized } from './locale';
import { strings } from './strings';

export type MeetupStatus = 'PROPOSED' | 'ACCEPTED';
export type FeedbackResponse = 'GREAT' | 'FINE' | 'NOT_FOR_ME' | 'UNCOMFORTABLE';

export type MeetupProposal = {
  proposalId: string;
  status: MeetupStatus;
  proposedByUserId: string;
  scheduledStart: string;
  scheduledEnd: string;
  spotName: string;
  spotNameEn: string | null;
  myFeedbackResponse: FeedbackResponse | null;
  shareLinks: { id: string; url: string; expiresAt: string; revokedAt: string | null }[];
};

export type MeetupOption = { day: number; block: number; spotId: string; spotName: string; spotNameEn: string | null; start: string; end: string };
export type SafeSpot = { id: string; name: string; nameEn: string | null };
export type EmergencyContact = { key: string; labelKo: string; labelEn: string; phone: string | null; noteKo?: string; noteEn?: string };

export type MeetupScreen = {
  matchId: string;
  other: { userId: string; firstName: string | null; photoUrl: string | null };
  now: string;
  proposal: MeetupProposal | null;
  options: MeetupOption[];
  safeSpots: SafeSpot[];
  customDays: string[];
  customBlocks: number[];
  emergencyContacts: EmergencyContact[];
};

const id = encodeURIComponent;

export const fetchMeetup = (matchId: string) => apiGet<MeetupScreen>(`/meetup/${id(matchId)}`);

export const proposeMeetup = (matchId: string, key: string, input: { spotId: string; day: number; block: number }) =>
  apiPostOnce<{ status: 'proposed' }>(`/meetup/${id(matchId)}/propose`, key, input);

export const proposeCustomMeetup = (matchId: string, key: string, input: { spotId: string; dayOffset: number; block: number }) =>
  apiPostOnce<{ status: 'proposed' }>(`/meetup/${id(matchId)}/propose-custom`, key, input);

export const respondToMeetup = (proposalId: string, decision: 'ACCEPT' | 'DECLINE') =>
  apiPost<{ status: 'accepted' | 'declined' }>(`/meetup/proposals/${id(proposalId)}/respond`, { decision });

export const cancelMeetup = (proposalId: string) => apiPost<{ status: 'cancelled' }>(`/meetup/proposals/${id(proposalId)}/cancel`, {});

export const submitFeedback = (proposalId: string, response: FeedbackResponse) =>
  apiPost<{ status: 'saved' }>(`/meetup/proposals/${id(proposalId)}/feedback`, { response });

export const createShareLink = (proposalId: string, key: string) =>
  apiPostOnce<{ status: 'created'; url: string; expiresAt: string }>(`/meetup/proposals/${id(proposalId)}/share-link`, key, {});

/** Times are always shown in Seoul time (the campus's own), whatever the phone's zone. Korea has no daylight saving. */
const SEOUL_OFFSET_MS = 9 * 60 * 60 * 1000;

function seoul(iso: string): Date {
  return new Date(new Date(iso).getTime() + SEOUL_OFFSET_MS);
}

/** "Wed, Oct 28" (or "10월 28일 (수)") for a Seoul calendar day. */
export function dayLabel(iso: string): string {
  const d = seoul(iso);
  return strings.dateLabel((d.getUTCDay() + 6) % 7, d.getUTCMonth(), d.getUTCDate());
}

/** The two-hour block a start time sits in, as in the free-time grid ("12–2pm"). */
export function blockLabel(block: number): string {
  return strings.blocks[block] ?? '';
}

export function blockOfStart(iso: string): number {
  return Math.floor(seoul(iso).getUTCHours() / 2);
}

/** "Wed, Oct 28 · 12–2pm" */
export function whenLabel(startIso: string): string {
  return `${dayLabel(startIso)} · ${blockLabel(blockOfStart(startIso))}`;
}

/** "Wed, Oct 28 · 8:00pm" — an exact moment, for things like when a link stops working. */
export function momentLabel(iso: string): string {
  const d = seoul(iso);
  return `${dayLabel(iso)} · ${strings.clockLabel(d.getUTCHours(), d.getUTCMinutes())}`;
}

export function spotLabel(spot: { name: string; nameEn: string | null }): string {
  return localized(spot.name, spot.nameEn);
}

/** The earliest a custom time can start from now, so the other person has time to answer (mirrors the server). */
export const CUSTOM_MIN_LEAD_MS = 60 * 60 * 1000;

export function customStartMs(dayIso: string, block: number): number {
  return new Date(dayIso).getTime() + block * 2 * 60 * 60 * 1000;
}
