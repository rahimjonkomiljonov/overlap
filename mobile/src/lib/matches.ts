import { apiGet, apiPost } from './api';

export type MatchSummary = {
  matchId: string;
  conversationId: string | null;
  otherUserId: string;
  firstName: string | null;
  photoUrl: string | null;
  matchedAt: string;
};

export const fetchMatches = () => apiGet<{ matches: MatchSummary[] }>('/matches');

export type UnmatchResult = { status: 'unmatched' };
export const unmatch = (matchId: string) => apiPost<UnmatchResult>(`/matches/${encodeURIComponent(matchId)}/unmatch`, {});
