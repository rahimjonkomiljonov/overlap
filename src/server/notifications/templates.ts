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
const TEMPLATES: Record<Exclude<NotificationType, "MODERATION_ACTION">, Record<NotificationLocale, EmailTemplate>> = {
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

/** What a moderator did, as stored in `Notification.data` for MODERATION_ACTION. */
export type ModerationNoticeData = { action: "WARN" | "SUSPEND" | "BAN"; until?: string };

function formatUntil(until: string | undefined, locale: NotificationLocale): string {
  if (!until) return "";
  return new Intl.DateTimeFormat(locale === "ko" ? "ko-KR" : "en-GB", {
    timeZone: "Asia/Seoul",
    dateStyle: "long",
    timeStyle: "short",
    hourCycle: "h23",
  }).format(new Date(until));
}

/**
 * The moderation notice. Like every other template it carries no names and no report
 * detail (nothing about who reported, no moderator note, which may quote chat text):
 * only what happened and where to read more and appeal.
 */
function renderModerationNotice(data: ModerationNoticeData | null, locale: NotificationLocale): EmailTemplate {
  const action = data?.action ?? "WARN";
  const until = formatUntil(data?.until, locale);
  if (locale === "ko") {
    if (action === "BAN") {
      return {
        subject: "Overlap 계정이 영구 정지되었어요",
        text: "운영팀이 신고를 검토한 결과 커뮤니티 가이드라인 위반으로 계정이 영구 정지되었어요. 앱의 안전 페이지에서 내용을 확인하고 이의를 제기할 수 있어요.",
      };
    }
    if (action === "SUSPEND") {
      return {
        subject: "Overlap 계정이 일시 정지되었어요",
        text: `운영팀이 신고를 검토한 결과 커뮤니티 가이드라인 위반으로 계정이 ${until}까지 일시 정지되었어요. 그동안 웨이브, 메시지, 약속 기능을 쓸 수 없어요. 앱의 안전 페이지에서 내용을 확인하고 이의를 제기할 수 있어요.`,
      };
    }
    return {
      subject: "Overlap 운영팀의 경고가 있어요",
      text: "운영팀이 신고를 검토한 결과 커뮤니티 가이드라인에 어긋나는 행동이 확인되어 경고드려요. 반복되면 계정이 정지될 수 있어요. 앱의 안전 페이지에서 내용을 확인하고 이의를 제기할 수 있어요.",
    };
  }
  if (action === "BAN") {
    return {
      subject: "Your Overlap account has been permanently closed",
      text: "After reviewing a report, our team closed your account for breaking the Community Guidelines. Open the Safety page in the app to read the details and appeal.",
    };
  }
  if (action === "SUSPEND") {
    return {
      subject: "Your Overlap account has been suspended",
      text: `After reviewing a report, our team suspended your account until ${until} (Seoul time) for breaking the Community Guidelines. Until then you can't wave, send messages or plan meetups. Open the Safety page in the app to read the details and appeal.`,
    };
  }
  return {
    subject: "A warning from the Overlap team",
    text: "After reviewing a report, our team found behaviour that goes against the Community Guidelines. Please take this as a warning; repeats can lead to suspension. Open the Safety page in the app to read the details and appeal.",
  };
}

export function renderNotificationEmail(
  type: NotificationType,
  locale: NotificationLocale,
  data?: unknown,
): EmailTemplate {
  if (type === "MODERATION_ACTION") {
    return renderModerationNotice((data as ModerationNoticeData | null | undefined) ?? null, locale);
  }
  return TEMPLATES[type][locale];
}
