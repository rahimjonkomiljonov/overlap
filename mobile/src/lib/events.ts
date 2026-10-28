import { apiGet, apiPostOnce, apiPut } from './api';
import { dayLabel } from './meetup';

export type EventPhase = 'upcoming' | 'ongoing' | 'connect' | 'closed' | 'cancelled';

export type EventListItem = {
  id: string;
  title: string;
  spotName: string;
  startsAt: string;
  endsAt: string;
  phase: EventPhase;
  goingCount: number;
  capacity: number | null;
  imGoing: boolean;
};

export type Guest = { userId: string; firstName: string | null; photoUrl: string | null; overlap: number; connected: boolean; matched: boolean };

export type EventDetail = {
  id: string;
  title: string;
  description: string;
  spotName: string;
  organizerFirstName: string | null;
  startsAt: string;
  endsAt: string;
  phase: EventPhase;
  goingCount: number;
  capacity: number | null;
  myRsvp: { showInGuestList: boolean } | null;
  viewerVerified: boolean;
  canRsvp: boolean;
  canConnect: boolean;
  guests: Guest[];
};

const id = encodeURIComponent;

export const fetchEvents = () => apiGet<{ events: EventListItem[] }>('/events');
export const fetchEvent = (eventId: string) => apiGet<EventDetail>(`/events/${id(eventId)}`);

export const setRsvp = (eventId: string, going: boolean, showInGuestList: boolean) =>
  apiPut<{ status: 'saved'; going: boolean; showInGuestList: boolean }>(`/events/${id(eventId)}/rsvp`, { going, showInGuestList });

export const connectAtEvent = (eventId: string, toUserId: string, idempotencyKey: string) =>
  apiPostOnce<{ status: 'connected'; matched: boolean }>(`/events/${id(eventId)}/connect`, idempotencyKey, { toUserId });

/** Event times are campus times: always Seoul, whatever zone the phone is in. */
function seoulClock(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 9 * 60 * 60 * 1000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/** "Fri, Oct 30 18:00–20:00", or both days when it runs past midnight. */
export function eventTimeLabel(startsAt: string, endsAt: string): string {
  const sameDay = dayLabel(startsAt) === dayLabel(endsAt);
  return sameDay
    ? `${dayLabel(startsAt)} ${seoulClock(startsAt)}–${seoulClock(endsAt)}`
    : `${dayLabel(startsAt)} ${seoulClock(startsAt)} – ${dayLabel(endsAt)} ${seoulClock(endsAt)}`;
}
