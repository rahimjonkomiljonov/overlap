import { apiGet, apiPost, apiPostOnce } from './api';

export type WaveTargetElement =
  | { type: 'profile' }
  | { type: 'photo'; photoId: string }
  | { type: 'promptAnswer'; promptAnswerId: string };

export type IncomingWave = {
  id: string;
  fromUserId: string;
  firstName: string | null;
  photoUrl: string | null;
  note: string | null;
  targetElement: WaveTargetElement;
  createdAt: string;
};

export const fetchWaves = () => apiGet<{ waves: IncomingWave[] }>('/waves');

export type WaveBackResult = { status: 'matched' };
export const waveBack = (waveId: string, idempotencyKey: string, note?: string) =>
  apiPostOnce<WaveBackResult>(`/waves/${encodeURIComponent(waveId)}/wave-back`, idempotencyKey, note ? { note } : {});

export type DeclineResult = { status: 'declined' };
export const declineWave = (waveId: string) => apiPost<DeclineResult>(`/waves/${encodeURIComponent(waveId)}/decline`, {});
