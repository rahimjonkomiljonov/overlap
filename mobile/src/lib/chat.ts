import { apiGet, apiPost, apiPostOnce } from './api';
import type { Reason } from './picks';
import { strings } from './strings';
import { getLocale } from './locale';


export type ChatMessage = { id: string; senderId: string; text: string; createdAt: string };

export type ChatDetail = {
  conversationId: string;
  matchId: string;
  status: 'ACTIVE' | 'EXPIRED';
  revivedAt: string | null;
  matchStatus: 'ACTIVE' | 'UNMATCHED';
  otherUserId: string;
  otherFirstName: string | null;
  otherPhotoUrl: string | null;
  canInteract: boolean;
  messages: ChatMessage[];
  icebreakers: Reason[];
};

export const fetchChatDetail = (conversationId: string) => apiGet<ChatDetail>(`/chat/${encodeURIComponent(conversationId)}?locale=${getLocale()}`);

export type SendMessageResult = { status: 'sent'; message: ChatMessage };
export const sendMessage = (conversationId: string, idempotencyKey: string, text: string) =>
  apiPostOnce<SendMessageResult>(`/chat/${encodeURIComponent(conversationId)}/messages`, idempotencyKey, { text });

export type ReviveResult = { status: 'revived' };
export const reviveConversation = (conversationId: string) => apiPost<ReviveResult>(`/chat/${encodeURIComponent(conversationId)}/revive`, {});

function icebreakerText(reason: Reason): string {
  switch (reason.type) {
    case 'course':
      return strings.icebreaker_course(reason.label);
    case 'club':
      return strings.icebreaker_club(reason.label);
    case 'interest':
      return strings.icebreaker_interest(reason.label);
    case 'freeTime':
      return strings.icebreaker_freeTime(strings.days[reason.day] ?? '', strings.blocks[reason.block] ?? '');
    case 'values':
      return strings.icebreaker_values;
  }
}

/** Conversation-starter suggestions for an empty thread: the shared-overlap reasons behind the match, or three generic ones when there are none. */
export function icebreakerSuggestions(icebreakers: Reason[]): string[] {
  if (icebreakers.length === 0) return [strings.icebreakerGeneric1, strings.icebreakerGeneric2, strings.icebreakerGeneric3];
  return icebreakers.map(icebreakerText);
}
