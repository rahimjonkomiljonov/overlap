import { apiGet, apiPost, apiPut } from './api';

export type ConsentEntry = { type: string; active: boolean; withdrawable: boolean; grantedAt: string | null; withdrawnAt: string | null };
export type DataRequest = { id: string; type: string; status: string; createdAt: string; dueAt: string; completedAt: string | null };
export type PrivacyOverview = { consents: ConsentEntry[]; dataRequests: DataRequest[] };

export const fetchPrivacy = () => apiGet<PrivacyOverview>('/privacy');

/** The person's own data, exactly as the server built it. The app only hands it to the share sheet and never stores it. */
export const fetchExport = () => apiGet<{ data: unknown }>('/privacy/export');

export const withdrawConsent = (type: string) => apiPost<{ status: 'withdrawn'; type: string }>('/privacy/consents/withdraw', { type });

/** Two phases on the server: the account closes and every session ends now; the details are erased 30 days later. */
export const deleteAccount = () => apiPost<{ status: 'deleted'; purgeAfter: string }>('/privacy/delete', { confirm: true });

export type MatchingPreferences = { classes: number; interests: number; freeTime: number; min: number; max: number; step: number };
export const fetchMatchingPreferences = () => apiGet<MatchingPreferences>('/preferences/matching');
export const saveMatchingPreferences = (values: { classes: number; interests: number; freeTime: number }) =>
  apiPut<{ status: 'saved' }>('/preferences/matching', values);

/** The five positions each slider can take, from the range the server reports. */
export function sliderSteps(prefs: Pick<MatchingPreferences, 'min' | 'max' | 'step'>): number[] {
  const steps: number[] = [];
  for (let v = prefs.min; v <= prefs.max + 1e-9; v += prefs.step) steps.push(Math.round(v * 100) / 100);
  return steps;
}
