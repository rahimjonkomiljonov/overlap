import type { NotificationType } from "@/generated/prisma/client";

export type NotificationLocale = "ko" | "en";

type EmailTemplate = { subject: string; text: string };

/**
 * Deliberately generic — no other user's name, no wave note, no message text. CLAUDE.md
 * forbids ever sending chat text to a third party, and a name/note in a transactional
 * email would put that same class of private content in a channel (an inbox, possibly
 * shared or less secure than the app) this codebase makes no promises about protecting.
 * The recipient always gets the detail by opening the app instead.
 */
const TEMPLATES: Record<NotificationType, Record<NotificationLocale, EmailTemplate>> = {
  MATCH: {
    ko: {
      subject: "Overlap에서 새로운 매치가 생겼어요",
      text: "서로 웨이브를 보내 매치가 성사됐어요! 앱을 열어 대화를 시작해보세요.",
    },
    en: {
      subject: "You have a new match on Overlap",
      text: "You and someone else waved at each other — it's a match! Open Overlap to start chatting.",
    },
  },
  WAVE_RECEIVED: {
    ko: {
      subject: "Overlap에서 웨이브를 받았어요",
      text: "누군가 당신에게 웨이브를 보냈어요. 앱을 열어 확인해보세요.",
    },
    en: {
      subject: "You received a wave on Overlap",
      text: "Someone sent you a wave. Open Overlap to see who it is.",
    },
  },
  UNREAD_MESSAGE: {
    ko: {
      subject: "읽지 않은 메시지가 있어요",
      text: "매치 상대가 보낸 메시지를 아직 확인하지 않았어요. 앱을 열어 답장해보세요.",
    },
    en: {
      subject: "You have an unread message on Overlap",
      text: "Your match sent you a message a while ago. Open Overlap to reply.",
    },
  },
};

export function renderNotificationEmail(type: NotificationType, locale: NotificationLocale): EmailTemplate {
  return TEMPLATES[type][locale];
}
