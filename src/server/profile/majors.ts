/**
 * Gachon University Global Campus colleges and departments, as published on the
 * university's own site (https://www.gachon.ac.kr/kor/911/subview.do, read 2026-10-10).
 * Kept in code rather than the database: it is a short, rarely changing list, and the
 * stored profile value is simply the Korean department name.
 *
 * The international college lists several departments that already appear under other
 * colleges (same name), so only its three distinct entries are repeated here. Update this
 * list when the university renames or adds a department; profiles keep whatever name they
 * saved, so an old name stays valid on existing profiles but cannot be picked again.
 */
export type MajorGroup = { college: string; majors: readonly string[] };

export const MAJOR_GROUPS: readonly MajorGroup[] = [
  { college: "가천리버럴아츠칼리지", majors: ["자유전공"] },
  {
    college: "경영대학",
    majors: ["경영학과", "회계세무학과", "금융·빅데이터학부", "의료산업경영학과", "관광경영학과"],
  },
  {
    college: "사회과학대학",
    majors: [
      "미디어커뮤니케이션학과",
      "경제학과",
      "응용통계학과",
      "사회복지학과",
      "유아교육학과",
      "심리학과",
      "패션산업학과",
    ],
  },
  {
    college: "AI인문대학",
    majors: ["한국어문학과", "영미어문학과", "동양어문학과", "유럽어문학과", "일본어문학과", "중국어문학과"],
  },
  { college: "법과대학", majors: ["법학과", "경찰행정학과", "행정학과", "경찰학연계전공"] },
  {
    college: "공과대학",
    majors: [
      "도시계획학전공",
      "조경학전공",
      "실내건축학전공",
      "건축학전공",
      "건축공학전공",
      "설비·소방공학전공",
      "화공생명공학전공",
      "기계공학과",
      "건설환경공학과",
      "산업공학전공",
      "신소재공학과",
      "스마트팩토리학과",
      "배터리공학전공",
      "미래자동차학과",
    ],
  },
  {
    college: "바이오나노대학",
    majors: ["바이오나노학과", "화학과", "물리학과", "생명과학과", "식품생물공학과", "식품영양학과"],
  },
  {
    college: "반도체대학",
    majors: ["전자공학과", "반도체공학과", "시스템반도체학과", "반도체·디스플레이학과", "반도체설계학과"],
  },
  {
    college: "IT융합대학",
    majors: [
      "인공지능학과",
      "컴퓨터공학과",
      "전기공학과",
      "에너지IT학과",
      "의공학과",
      "스마트시티학과",
      "스마트보안학과",
      "클라우드공학과",
      "게임·영상학과",
      "바이오의료기기학과",
    ],
  },
  { college: "한의과대학", majors: ["한의예과", "한의학과"] },
  {
    college: "예술·체육대학",
    majors: [
      "회화전공",
      "조소전공",
      "시각디자인전공",
      "산업디자인전공",
      "기악전공",
      "성악전공",
      "작곡전공",
      "체육전공",
      "태권도전공",
      "운동재활학과",
      "연기예술학과",
    ],
  },
  { college: "국제대학", majors: ["국제자유전공", "한국학전공", "한국어교육학과"] },
];

/** Stored when someone's department isn't on the list (for example a graduate programme). */
export const OTHER_MAJOR = "기타";

const KNOWN_MAJORS: ReadonlySet<string> = new Set([
  OTHER_MAJOR,
  ...MAJOR_GROUPS.flatMap((group) => group.majors),
]);

export function isKnownMajor(value: string): boolean {
  return KNOWN_MAJORS.has(value);
}

/** Years shown in the pick list: 1 to 4, then "5+" (stored as 5). */
export const MAX_STUDY_YEAR = 5;
export const STUDY_YEARS: readonly number[] = [1, 2, 3, 4, MAX_STUDY_YEAR];
