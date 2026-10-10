"use client";

import { useTranslations } from "next-intl";
import { IntentBadge } from "@/components/picks/intent-style";
import { PicksFlow } from "@/components/picks/picks-flow";
import type { PickActions } from "@/components/picks/pick-card-actions";
import type { PickCardData } from "@/server/picks/queries";

/** A soft two-colour gradient with an initial, as an inline image: no files, nothing to load. */
function samplePhoto(id: string, initial: string, from: string, to: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="400" height="300" fill="url(#g)"/><text x="200" y="185" font-size="140" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="white" fill-opacity="0.85">${initial}</text></svg>`;
  return { id, url: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` };
}

const SAMPLE: PickCardData[] = [
  {
    batchItemId: "a",
    candidateUserId: "u-a",
    firstName: "Sample Min",
    gender: null,
    year: 3,
    major: "컴퓨터공학과",
    photos: [samplePhoto("a1", "M", "#0d9488", "#0ea5e9"), samplePhoto("a2", "I", "#f59e0b", "#ef4444"), samplePhoto("a3", "N", "#8b5cf6", "#ec4899")],
    prompts: [
      { id: "p1", textKo: "이번 주말에 가장 하고 싶은 것", textEn: "What I most want to do this weekend", answer: "Climb something and eat something afterwards." },
    ],
    reasons: [
      { type: "course", label: "Data Structures" },
      { type: "club", label: "Hiking Club" },
      { type: "interest", label: "Board games" },
      { type: "freeTime", day: 3, block: 7 },
      { type: "values" },
    ],
    secondChance: false,
  },
  {
    batchItemId: "cap",
    candidateUserId: "u-b",
    firstName: "Sample Jae (wave is refused)",
    gender: null,
    year: 2,
    major: "경영학과 (영어 트랙)",
    photos: [samplePhoto("b1", "J", "#06b6d4", "#6366f1")],
    prompts: [{ id: "p2", textKo: "내가 가장 좋아하는 캠퍼스 장소", textEn: "My favorite spot on campus is", answer: "The third floor of the library, by the window." }],
    reasons: [{ type: "course", label: "Intro to Marketing" }, { type: "freeTime", day: 1, block: 8 }],
    secondChance: true,
  },
  {
    batchItemId: "c",
    candidateUserId: "u-c",
    firstName: "Sample Soo",
    gender: null,
    year: 4,
    major: "심리학과",
    photos: [samplePhoto("c1", "S", "#f43f5e", "#f59e0b"), samplePhoto("c2", "O", "#14b8a6", "#22c55e")],
    prompts: [],
    reasons: [{ type: "interest", label: "Film photography" }, { type: "values" }],
    secondChance: false,
  },
];

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Stand-ins for the server actions: success after a short delay, except the card marked "cap", whose wave is refused. */
const PREVIEW_ACTIONS: PickActions = {
  sendWave: async (_prev, formData) => {
    await wait(450);
    return formData.get("batchItemId") === "cap" ? { status: "error", code: "DAILY_CAP_REACHED" } : { status: "success" };
  },
  passPick: async () => {
    await wait(450);
    return { status: "success" };
  },
};

export function PicksPreview() {
  const t = useTranslations("Picks");
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")} (preview)</h1>
      <section className="space-y-4">
        <h2>
          <IntentBadge intent="FRIENDS" label="Friends" />
        </h2>
        <PicksFlow items={SAMPLE} intent="FRIENDS" actions={PREVIEW_ACTIONS} />
      </section>
      <section className="space-y-4">
        <h2>
          <IntentBadge intent="STUDY" label="Study buddy" />
        </h2>
        <PicksFlow items={SAMPLE.map((s) => ({ ...s, batchItemId: `s-${s.batchItemId}` }))} intent="STUDY" actions={PREVIEW_ACTIONS} />
      </section>
    </div>
  );
}
