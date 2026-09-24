/**
 * The 8 values-quiz Likert items (B10). This file is the only source of question text
 * — answers are stored as plain integers (Profile.valuesAnswers, src/server/profile/
 * schema.ts's valuesQuizSchema), so there is no way for a sensitive category
 * (religion, politics, health, sex life — REQUIREMENTS.md B10) to sneak in through
 * user-authored content the way a free-text field could.
 */

export type ValuesQuizItem = { key: string; textKo: string; textEn: string };

export const VALUES_QUIZ_ITEMS: readonly ValuesQuizItem[] = [
  {
    key: "socialEnergy",
    textKo: "사람이 많은 모임에 있으면 에너지가 생긴다.",
    textEn: "Being around a big group of people energizes me.",
  },
  {
    key: "planning",
    textKo: "즉흥적으로 정하기보다 미리 계획을 세우는 편이다.",
    textEn: "I'd rather plan things in advance than decide at the last minute.",
  },
  {
    key: "ambition",
    textKo: "쉬는 것보다 큰 목표를 이루는 것이 더 중요하다.",
    textEn: "Working toward big goals matters more to me than relaxing.",
  },
  {
    key: "novelty",
    textKo: "익숙한 곳보다 새로운 장소나 활동을 시도하는 걸 좋아한다.",
    textEn: "I like trying new places and activities more than sticking to favorites.",
  },
  {
    key: "directness",
    textKo: "직설적으로 들리더라도 생각한 그대로 말한다.",
    textEn: "I say what's on my mind, even if it comes across as blunt.",
  },
  {
    key: "punctuality",
    textKo: "약속 시간을 지키는 것이 나에게 매우 중요하다.",
    textEn: "Being on time matters a lot to me.",
  },
  {
    key: "riskTolerance",
    textKo: "안전하게 가는 것보다 위험을 감수하는 걸 즐긴다.",
    textEn: "I enjoy taking risks more than playing it safe.",
  },
  {
    key: "independence",
    textKo: "친한 사이에서도 혼자만의 시간이 충분히 필요하다.",
    textEn: "I need plenty of alone time, even with close friends.",
  },
];
