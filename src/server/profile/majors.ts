/**
 * Gachon University Global Campus colleges and departments. The Korean names come from the
 * university's own site (https://www.gachon.ac.kr/kor/911/subview.do, read 2026-10-10); the
 * English names come from its English site (https://www.gachon.ac.kr/eng/12725/subview.do
 * and the college pages under it, same day) with "Department of" / "Division of" left off
 * for brevity. The stored profile value is always the Korean name; `ko` is the key.
 *
 * `en` entries marked "own translation" are not on the English site (the English pages list
 * fewer departments than the Korean ones, or name a different one) and are literal
 * translations of the Korean name. Check them against the university before launch.
 *
 * The international college repeats several departments that already appear under other
 * colleges (same name), so only its three distinct entries are listed here. Update this list
 * when the university renames or adds a department; profiles keep whatever name they saved,
 * so an old name stays on existing profiles but cannot be picked again.
 */
export type MajorOption = { ko: string; en: string };
export type MajorGroup = { college: MajorOption; majors: readonly MajorOption[] };

export const MAJOR_GROUPS: readonly MajorGroup[] = [
  {
    college: { ko: "가천리버럴아츠칼리지", en: "Gachon Liberal Arts College" },
    majors: [{ ko: "자유전공", en: "Free Major" }],
  },
  {
    college: { ko: "경영대학", en: "College of Business" },
    majors: [
      { ko: "경영학과", en: "Business Management" },
      { ko: "회계세무학과", en: "Accounting & Taxation" },
      { ko: "금융·빅데이터학부", en: "Finance and Big Data" },
      { ko: "의료산업경영학과", en: "Healthcare Management" },
      { ko: "관광경영학과", en: "Tourism Management" },
    ],
  },
  {
    college: { ko: "사회과학대학", en: "College of Social Sciences" },
    majors: [
      { ko: "미디어커뮤니케이션학과", en: "Media and Communication" },
      { ko: "경제학과", en: "Economics" },
      { ko: "응용통계학과", en: "Applied Statistics" },
      { ko: "사회복지학과", en: "Social Welfare" },
      { ko: "유아교육학과", en: "Early Childhood Education" },
      { ko: "심리학과", en: "Psychology" },
      { ko: "패션산업학과", en: "Fashion Design and Merchandising" },
    ],
  },
  {
    college: { ko: "AI인문대학", en: "College of AI Humanities" },
    majors: [
      { ko: "한국어문학과", en: "Korean Language and Literature" },
      { ko: "영미어문학과", en: "English Language and Literature" },
      { ko: "동양어문학과", en: "Asian Languages and Literature" }, // own translation
      { ko: "유럽어문학과", en: "European Language and Literature" },
      { ko: "일본어문학과", en: "Japanese Language and Literature" },
      { ko: "중국어문학과", en: "Chinese Language and Literature" },
    ],
  },
  {
    college: { ko: "법과대학", en: "College of Law" },
    majors: [
      { ko: "법학과", en: "Law" },
      { ko: "경찰행정학과", en: "Police Administration" },
      { ko: "행정학과", en: "Public Administration" },
      { ko: "경찰학연계전공", en: "Police Studies (linked major)" },
    ],
  },
  {
    college: { ko: "공과대학", en: "College of Engineering" },
    majors: [
      { ko: "도시계획학전공", en: "Urban Planning" },
      { ko: "조경학전공", en: "Landscape Architecture" },
      { ko: "실내건축학전공", en: "Interior Architecture" },
      { ko: "건축학전공", en: "Architecture" },
      { ko: "건축공학전공", en: "Architectural Engineering" },
      { ko: "설비·소방공학전공", en: "Equipment and Fire Protection Engineering" },
      { ko: "화공생명공학전공", en: "Chemical & Biological Engineering" },
      { ko: "기계공학과", en: "Mechanical Engineering" },
      { ko: "건설환경공학과", en: "Civil & Environmental Engineering" },
      { ko: "산업공학전공", en: "Industrial Management Engineering" },
      { ko: "신소재공학과", en: "Materials Science and Engineering" },
      { ko: "스마트팩토리학과", en: "Smart Factory" },
      { ko: "배터리공학전공", en: "Battery Engineering" },
      { ko: "미래자동차학과", en: "Future Automobile" },
    ],
  },
  {
    college: { ko: "바이오나노대학", en: "College of Bionanotechnology" },
    majors: [
      { ko: "바이오나노학과", en: "Bio-Nano Technology" },
      { ko: "화학과", en: "Chemistry" },
      { ko: "물리학과", en: "Physics and Semiconductor Science" },
      { ko: "생명과학과", en: "Life Sciences" },
      { ko: "식품생물공학과", en: "Food Science and Biotechnology" },
      { ko: "식품영양학과", en: "Food and Nutrition" },
    ],
  },
  {
    college: { ko: "반도체대학", en: "College of Semiconductors" },
    majors: [
      { ko: "전자공학과", en: "Electronic Engineering" }, // own translation
      { ko: "반도체공학과", en: "Semiconductor Engineering" },
      { ko: "시스템반도체학과", en: "System Semiconductor" },
      { ko: "반도체·디스플레이학과", en: "Semiconductor Display" },
      { ko: "반도체설계학과", en: "Semiconductor Design" },
    ],
  },
  {
    college: { ko: "IT융합대학", en: "College of IT Convergence" },
    majors: [
      { ko: "인공지능학과", en: "Artificial Intelligence" }, // own translation
      { ko: "컴퓨터공학과", en: "Computer Engineering" },
      { ko: "전기공학과", en: "Electrical Engineering" },
      { ko: "에너지IT학과", en: "Energy IT" }, // own translation
      { ko: "의공학과", en: "Biomedical Engineering" },
      { ko: "스마트시티학과", en: "Smart City" },
      { ko: "스마트보안학과", en: "Smart Security" },
      { ko: "클라우드공학과", en: "Cloud Engineering" },
      { ko: "게임·영상학과", en: "Game and Media" },
      { ko: "바이오의료기기학과", en: "Bio Medical Devices" },
    ],
  },
  {
    college: { ko: "한의과대학", en: "College of Korean Medicine" },
    majors: [
      { ko: "한의예과", en: "Pre-Korean Medicine" },
      { ko: "한의학과", en: "Korean Medicine" },
    ],
  },
  {
    college: { ko: "예술·체육대학", en: "College of Art & Physical Education" },
    majors: [
      { ko: "회화전공", en: "Painting" },
      { ko: "조소전공", en: "Sculpture" },
      { ko: "시각디자인전공", en: "Visual Design" },
      { ko: "산업디자인전공", en: "Industrial Design" },
      { ko: "기악전공", en: "Instrumental Music" },
      { ko: "성악전공", en: "Voice" },
      { ko: "작곡전공", en: "Composition" },
      { ko: "체육전공", en: "Physical Education" },
      { ko: "태권도전공", en: "Taekwondo" },
      { ko: "운동재활학과", en: "Exercise Rehabilitation" },
      { ko: "연기예술학과", en: "Acting Arts" },
    ],
  },
  {
    college: { ko: "국제대학", en: "International College" },
    majors: [
      { ko: "국제자유전공", en: "International Liberal Studies" },
      { ko: "한국학전공", en: "Korean Studies" },
      { ko: "한국어교육학과", en: "Teaching Korean" },
    ],
  },
];

/** Stored when someone's department isn't on the list (for example a graduate programme). */
export const OTHER_MAJOR = "기타";

const KNOWN_MAJORS: ReadonlySet<string> = new Set([
  OTHER_MAJOR,
  ...MAJOR_GROUPS.flatMap((group) => group.majors.map((m) => m.ko)),
]);

const ENGLISH_BY_KOREAN: ReadonlyMap<string, string> = new Map([
  [OTHER_MAJOR, "Other"],
  ...MAJOR_GROUPS.flatMap((group) => group.majors.map((m) => [m.ko, m.en] as const)),
]);

export function isKnownMajor(value: string): boolean {
  return KNOWN_MAJORS.has(value);
}

/**
 * How to show a stored major: the English name in the English app, the Korean name
 * otherwise. A value that is not on the list (a profile saved before this was a pick list)
 * is shown exactly as typed.
 */
export function majorLabel(stored: string, locale: string): string {
  if (locale !== "en") return stored;
  return ENGLISH_BY_KOREAN.get(stored) ?? stored;
}

/** Years shown in the pick list: 1 to 4, then "5+" (stored as 5). */
export const MAX_STUDY_YEAR = 5;
export const STUDY_YEARS: readonly number[] = [1, 2, 3, 4, MAX_STUDY_YEAR];
