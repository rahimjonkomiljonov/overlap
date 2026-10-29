import { apiGet, apiPostOnce, apiPut, type ApiErrorCode, type ApiResult } from './api';
import { strings } from './strings';
import { getLocale } from './locale';


export type PocketKind = 'course' | 'club';

export type PocketSummary = { kind: PocketKind; id: string; label: string; memberCount: number };

export type MyPockets = {
  verified: boolean;
  visible: boolean;
  hasPocketIntent: boolean;
  pockets: PocketSummary[];
};

export type PocketMember = {
  userId: string;
  firstName: string | null;
  year: number | null;
  photoUrl: string | null;
  intents: string[];
  alsoShared: number;
  waved: boolean;
  matched: boolean;
};

export type PocketDetail = {
  verified: boolean;
  visible: boolean;
  hasPocketIntent: boolean;
  label: string;
  members: PocketMember[];
};

export const fetchMyPockets = () => apiGet<MyPockets>(`/pockets?locale=${getLocale()}`);

export const setPocketsVisible = (visible: boolean) => apiPut<{ visible: boolean }>('/pockets/visibility', { visible });

export const fetchPocketDetail = (kind: PocketKind, pocketId: string) => apiGet<PocketDetail>(`/pockets/${kind}/${encodeURIComponent(pocketId)}?locale=${getLocale()}`);

export type WaveResult = { status: 'sent'; matched: boolean };

export const waveInPocket = (kind: PocketKind, pocketId: string, toUserId: string, idempotencyKey: string) =>
  apiPostOnce<WaveResult>('/pockets/wave', idempotencyKey, { kind, pocketId, toUserId });

/** What a failed pockets request means to a person. */
export function pocketsProblemText(result: Extract<ApiResult<unknown>, { ok: false }>, fallback: string): string {
  if (result.code === 'NETWORK') return strings.offlineBody;
  if (result.code === 'RATE_LIMITED') return strings.errorTooManyRequests;
  if (result.code === 'RULE_VIOLATION' && result.reason === 'BLOCKED') return strings.pocketWaveBlocked;
  if (result.code === 'RULE_VIOLATION' && result.reason === 'DAILY_CAP_REACHED') return strings.pocketWaveCapReached;
  if (result.code === 'NOT_FOUND') return strings.pocketMemberGone;
  return fallback;
}

export type { ApiErrorCode };
