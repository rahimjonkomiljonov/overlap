/**
 * Keyword guard against the categories PIPA Art. 23 treats as sensitive information
 * (religion, political views, health, sexual life) plus union/labor membership, which
 * REQUIREMENTS.md §7 also excludes from the interest taxonomy and values quiz. Used at
 * import time to reject a club/interest/prompt row that reveals one of these — not a
 * general profanity filter, and not exhaustive; a human reviews the validation report
 * (src/server/reference/report.ts) before trusting an import either way.
 *
 * Keywords are deliberately broad (better to over-flag and let a human clear a false
 * positive than to import something sensitive silently).
 */
const SENSITIVE_KEYWORDS = [
  // Religion
  "기독교",
  "개신교",
  "천주교",
  "가톨릭",
  "불교",
  "이슬람",
  "무슬림",
  "선교",
  "교회",
  "성당",
  "법당",
  "성경",
  "불경",
  "찬양",
  "christian",
  "catholic",
  "buddhis",
  "muslim",
  "islam",
  "church",
  "religion",
  "religious",
  // Politics
  "정당",
  "정치",
  "총학생회",
  "운동권",
  "보수",
  "진보",
  "여당",
  "야당",
  "political",
  "politics",
  // Health / disability / mental health
  "장애인",
  "정신질환",
  "정신건강",
  "질병",
  "환우",
  "disability",
  "disabled",
  "mental health",
  "illness",
  "disease",
  // Sexual life / orientation
  "성소수자",
  "동성애",
  "이성애",
  "퀴어",
  "lgbt",
  "queer",
  "sexual orientation",
  "성생활",
  // Labor / union
  "노동조합",
  "노조",
  "union",
] as const;

/** True if `text` contains a keyword from any sensitive category (case-insensitive). */
export function containsSensitiveContent(text: string): boolean {
  const lower = text.toLowerCase();
  return SENSITIVE_KEYWORDS.some((keyword) => lower.includes(keyword.toLowerCase()));
}

/** Every sensitive keyword found in `text`, for validation-report detail. */
export function findSensitiveKeywords(text: string): string[] {
  const lower = text.toLowerCase();
  return SENSITIVE_KEYWORDS.filter((keyword) => lower.includes(keyword.toLowerCase()));
}
