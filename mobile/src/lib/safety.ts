import { apiDelete, apiGet, apiPost, apiPostOnce, apiPut } from './api';

export type AccountStatus = 'ACTIVE' | 'PAUSED' | 'SUSPENDED' | 'BANNED';

export type ModerationAction = { id: string; type: string; reason: string; createdAt: string; appealNote: string | null; appealedAt: string | null };

export type SafetyScreen = {
  status: AccountStatus;
  suspendedUntil: string | null;
  paused: boolean;
  incognito: boolean;
  blocked: { userId: string; name: string }[];
  hidden: { userId: string; name: string }[];
  courses: { id: string; code: string; title: string }[];
  clubs: { id: string; name: string }[];
  actions: ModerationAction[];
  trust: {
    limited: boolean;
    restoredUntil: string | null;
    openAppealSince: string | null;
    lastDecision: { status: 'ACCEPTED' | 'REJECTED'; response: string | null } | null;
  };
};

export const REPORT_CATEGORIES = [
  'NON_CONSENSUAL_IMAGERY',
  'DEEPFAKE',
  'ILLEGAL_FILMING',
  'HARASSMENT',
  'UNWANTED_CONTACT',
  'SCAM_OR_PHISHING',
  'SPAM',
  'FAKE_PROFILE',
  'INAPPROPRIATE_CONTENT',
  'OTHER',
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

const id = encodeURIComponent;

export const fetchSafety = () => apiGet<SafetyScreen>('/safety');
export const setPaused = (paused: boolean) => apiPut<{ status: 'saved'; paused: boolean }>('/safety/paused', { paused });
export const setIncognito = (incognito: boolean) => apiPut<{ status: 'saved'; incognito: boolean }>('/safety/incognito', { incognito });

export const fileReport = (key: string, input: { targetUserId: string; category: ReportCategory; description?: string; conversationId?: string }) =>
  apiPostOnce<{ status: 'filed'; hidden: boolean }>('/reports', key, input);

export const blockUser = (targetUserId: string) => apiPost<{ status: 'blocked' }>('/blocks', { targetUserId });
export const unblockUser = (userId: string) => apiDelete<{ status: 'unblocked' }>(`/blocks/${id(userId)}`);

export const hideCourse = (courseId: string) => apiPost<{ status: 'hidden'; count: number }>('/hides/course', { courseId });
export const hideClub = (clubId: string) => apiPost<{ status: 'hidden'; count: number }>('/hides/club', { clubId });
export const hideEmail = (email: string) => apiPost<{ status: 'hidden'; count: number }>('/hides/email', { email });
export const unhideUser = (userId: string) => apiDelete<{ status: 'unhidden' }>(`/hides/${id(userId)}`);

export const submitAppeal = (moderationActionId: string, appealNote: string) => apiPost<{ status: 'submitted' }>('/safety/appeals', { moderationActionId, appealNote });
export const submitTrustAppeal = (note: string) => apiPost<{ status: 'submitted' }>('/safety/trust-appeals', { note });
