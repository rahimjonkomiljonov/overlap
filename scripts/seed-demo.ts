import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadEnv } from "dotenv";
import sharp from "sharp";
import { ConsentType, Gender, IntentMode, Role } from "../src/generated/prisma/enums";
import { PrismaClient } from "../src/generated/prisma/client";
import { newPhotoStorageKey, processPhoto, uploadPhoto } from "../src/server/storage/photos";

/**
 * Builds the demonstration campus: nine hand-designed fictional students, fourteen generated
 * ones and one operator account on "Hartwell University" (hartwell.edu), with overlaps designed
 * so the matching algorithm has something clear to show. Everything is invented: names, majors, interests, free time,
 * and the generated avatars (abstract shapes with a small "DEMO" tag, never a face).
 *
 * Run after `db:create-campus --name "Hartwell University" --domain hartwell.edu` and the
 * reference imports (see docs/demo-runbook.md).
 *
 * Usage: tsx scripts/seed-demo.ts
 *
 * Refuses to run against a database that is not on this computer unless both `--production-demo`
 * and DEMO_PRODUCTION_OK=hartwell.edu are given (owner decision 2026-10-11, see CLAUDE.md): the
 * fictional people then live only in the separate Hartwell campus and are flagged `isSynthetic`
 * so notifications skip them. `db:check-readiness` still fails while any exist, so remove them
 * (`scripts/demo-campus.ts remove`) before any real launch.
 *
 * Demo logins: with DEMO_OWNER_EMAIL=you@gmail.com everyone gets the plus-address you+<key>@gmail.com,
 * so any sign-in code reaches your own inbox and no fake address ever bounces. Without it they use
 * <key>@hartwell.edu (local database only, where codes are written to a file instead of sent).
 */

const DOMAIN = "hartwell.edu";
function emailFor(key: string): string {
  const owner = process.env.DEMO_OWNER_EMAIL?.trim().toLowerCase();
  if (owner) {
    const [local, domain] = owner.split("@");
    return `${local}+${key}@${domain}`;
  }
  return `${key}@${DOMAIN}`;
}

type Persona = {
  key: string;
  firstName: string;
  gender: Gender;
  birthYear: number;
  year: number;
  major: string;
  intents: IntentMode[];
  courses: [code: string, section: string][];
  clubs: string[];
  interests: string[];
  freeTime: number[];
  values: number[];
  prompts: [key: string, answer: string][];
  colors: [string, string];
  role?: Role;
  hidden?: boolean;
};

/** Free-time slot = day (0=Mon..6=Sun) * 12 + two-hour block (6 = 12-14, 7 = 14-16, 8 = 16-18, 9 = 18-20). */
const slot = (day: number, block: number) => day * 12 + block;
const MON = 0, TUE = 1, WED = 2, THU = 3, FRI = 4, SAT = 5;

const PERSONAS: Persona[] = [
  {
    key: "emma", firstName: "Emma", gender: Gender.WOMAN, birthYear: 2005, year: 3, major: "컴퓨터공학과",
    intents: [IntentMode.FRIENDS, IntentMode.STUDY],
    courses: [["DCS2010", "001"], ["DEC1001", "001"], ["DPS1010", "001"]],
    clubs: ["Lens & Light Photography", "Board Game Cafe Club"],
    interests: ["photography", "board-games", "coffee", "hiking", "coding-projects"],
    freeTime: [slot(MON, 7), slot(MON, 8), slot(WED, 7), slot(WED, 8), slot(THU, 7), slot(THU, 8), slot(FRI, 5)],
    values: [4, 3, 5, 4, 2, 4, 3, 5],
    prompts: [
      ["weekend-plan", "Photo walk first, board games after."],
      ["favorite-spot", "The third floor of the library, by the window."],
      ["go-to-order", "Iced americano, no sugar."],
    ],
    colors: ["#0d9488", "#0ea5e9"],
  },
  {
    key: "liam", firstName: "Liam", gender: Gender.MAN, birthYear: 2005, year: 3, major: "컴퓨터공학과",
    intents: [IntentMode.FRIENDS, IntentMode.STUDY],
    courses: [["DCS2010", "001"], ["DCS3010", "001"], ["DEC1001", "001"]],
    clubs: ["Board Game Cafe Club", "Startup Study Group"],
    interests: ["board-games", "coding-projects", "video-games", "coffee"],
    freeTime: [slot(MON, 7), slot(MON, 8), slot(WED, 8), slot(THU, 7), slot(SAT, 7)],
    values: [4, 3, 4, 4, 2, 4, 3, 5],
    prompts: [
      ["learning-now", "How to make a decent pour-over at home."],
      ["ideal-day", "Late breakfast, a long coding session, a new board game at night."],
      ["random-fact", "I have never lost a game of Codenames. Yet."],
    ],
    colors: ["#6366f1", "#8b5cf6"],
  },
  {
    key: "sophia", firstName: "Sophia", gender: Gender.WOMAN, birthYear: 2004, year: 4, major: "시각디자인전공",
    intents: [IntentMode.FRIENDS],
    courses: [["DDS2020", "001"], ["DPS1010", "001"]],
    clubs: ["Lens & Light Photography", "Film Society Reel"],
    interests: ["photography", "cafe-hopping", "indie-music", "painting"],
    freeTime: [slot(THU, 7), slot(THU, 8), slot(FRI, 5), slot(SAT, 6)],
    values: [3, 4, 4, 2, 4, 3, 5, 3],
    prompts: [
      ["currently-into", "Film cameras and the smell of a darkroom."],
      ["favorite-spot", "The lawn when the cherry trees are out."],
      ["weekend-plan", "A new cafe, a roll of film, no plan."],
    ],
    colors: ["#f43f5e", "#f59e0b"],
  },
  {
    key: "daniel", firstName: "Daniel", gender: Gender.MAN, birthYear: 2005, year: 2, major: "경영학과 (영어 트랙)",
    intents: [IntentMode.FRIENDS],
    courses: [["DBA1001", "001"], ["DEC1001", "001"]],
    clubs: ["Hoop Dreams Basketball"],
    interests: ["basketball", "travel-planning", "coffee"],
    freeTime: [slot(TUE, 8), slot(FRI, 5), slot(SAT, 9)],
    values: [2, 4, 3, 5, 3, 2, 4, 4],
    prompts: [
      ["go-to-order", "Flat white and a very large cookie."],
      ["ideal-day", "Morning run, pick-up game at six."],
      ["learning-now", "Conversational Korean (the slang is hard)."],
    ],
    colors: ["#f59e0b", "#ef4444"],
  },
  {
    key: "olivia", firstName: "Olivia", gender: Gender.WOMAN, birthYear: 2005, year: 3, major: "심리학과",
    intents: [IntentMode.FRIENDS, IntentMode.STUDY],
    courses: [["DPS1010", "001"], ["DEN1001", "001"]],
    clubs: ["Board Game Cafe Club", "Volunteer Corps"],
    interests: ["board-games", "journaling", "plants", "baking"],
    freeTime: [slot(MON, 7), slot(WED, 7), slot(THU, 8), slot(SAT, 6)],
    values: [5, 3, 5, 3, 3, 4, 2, 4],
    prompts: [
      ["overshare", "I keep a list of every plant I have accidentally killed."],
      ["weekend-plan", "Bake something, then argue about the rules of a board game."],
      ["currently-into", "Habit tracking. Too much."],
    ],
    colors: ["#14b8a6", "#22c55e"],
  },
  {
    key: "noah", firstName: "Noah", gender: Gender.MAN, birthYear: 2004, year: 3, major: "컴퓨터공학과 (영어 트랙)",
    intents: [IntentMode.OPEN],
    courses: [["DCS2010", "002"], ["DCS3010", "001"], ["DEN1001", "001"]],
    clubs: ["Trail Hikers", "Startup Study Group"],
    interests: ["hiking", "anime", "coding-projects", "language-exchange"],
    freeTime: [slot(MON, 8), slot(FRI, 5), slot(SAT, 7)],
    values: [3, 3, 4, 4, 3, 5, 3, 4],
    prompts: [
      ["random-fact", "Exchange student, and I have hiked all four peaks near campus."],
      ["learning-now", "Reading Korean menus without a translator."],
      ["ideal-day", "Sunrise hike, then an overly long lunch."],
    ],
    colors: ["#0ea5e9", "#6366f1"],
  },
  {
    key: "ethan", firstName: "Ethan", gender: Gender.MAN, birthYear: 2005, year: 2, major: "경제학과",
    intents: [IntentMode.STUDY],
    courses: [["DEC1001", "001"], ["DBA1001", "001"]],
    clubs: ["Hoop Dreams Basketball"],
    interests: ["basketball", "running", "korean-drama"],
    freeTime: [slot(TUE, 9), slot(SAT, 8)],
    values: [2, 5, 2, 4, 4, 3, 3, 2],
    prompts: [
      ["go-to-order", "Hot chocolate, even in July."],
      ["weekend-plan", "Pick-up basketball and a drama marathon."],
      ["favorite-spot", "The sports hall lobby after a game."],
    ],
    colors: ["#f97316", "#facc15"],
  },
  {
    key: "grace", firstName: "Grace", gender: Gender.WOMAN, birthYear: 2004, year: 3, major: "산업디자인전공",
    intents: [IntentMode.FRIENDS],
    courses: [["DDS2020", "001"], ["DEN1001", "001"]],
    clubs: ["Lens & Light Photography", "Acoustic Band Echo"],
    interests: ["photography", "painting", "cafe-hopping", "indie-music"],
    freeTime: [slot(WED, 7), slot(THU, 7), slot(SAT, 6)],
    values: [3, 3, 4, 3, 5, 3, 4, 3],
    prompts: [
      ["currently-into", "Risograph prints and sketchbooks."],
      ["ideal-day", "Studio in the morning, live music at night."],
      ["go-to-order", "Oat latte, extra hot."],
    ],
    colors: ["#ec4899", "#a855f7"],
  },
  {
    key: "jack", firstName: "Jack", gender: Gender.MAN, birthYear: 2003, year: 4, major: "법학과",
    intents: [IntentMode.FRIENDS],
    courses: [["DBA1001", "001"]],
    clubs: ["Volunteer Corps"],
    interests: ["running", "sci-fi-novels"],
    freeTime: [slot(SAT, 6), slot(SAT, 7)],
    values: [1, 5, 1, 5, 4, 1, 2, 1],
    prompts: [
      ["random-fact", "I read the whole Foundation series in a week."],
      ["learning-now", "Debate, mostly by losing."],
      ["weekend-plan", "Long run, then a longer book."],
    ],
    colors: ["#64748b", "#334155"],
  },
  {
    key: "operator", firstName: "Operator", gender: Gender.WOMAN, birthYear: 2000, year: 4, major: "기타",
    intents: [IntentMode.FRIENDS],
    courses: [],
    clubs: [],
    interests: ["journaling"],
    freeTime: [],
    values: [3, 3, 3, 3, 3, 3, 3, 3],
    prompts: [
      ["random-fact", "I review reports and verification photos."],
      ["learning-now", "How to be fair at scale."],
      ["go-to-order", "Green tea."],
    ],
    colors: ["#0f766e", "#115e59"],
    role: Role.ADMIN,
    hidden: true,
  },
];

/** Small seeded generator so the generated people are the same on every run. */
function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353), (h = (h << 13) | (h >>> 19));
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}
const pick = <T,>(r: () => number, list: readonly T[], n: number): T[] => {
  const pool = [...list];
  const out: T[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
};

type Archetype = { majors: string[]; courses: [string, string][]; clubs: string[]; interests: string[]; colors: [string, string][]; prompts: [string, string][] };
const ARCHETYPES: Record<string, Archetype> = {
  cs: {
    majors: ["컴퓨터공학과", "인공지능학과", "클라우드공학과"],
    courses: [["DCS2010", "001"], ["DCS2010", "002"], ["DCS3010", "001"], ["DCS2020", "001"], ["DMA1010", "001"]],
    clubs: ["Startup Study Group", "Robotics Lab", "Board Game Cafe Club"],
    interests: ["coding-projects", "video-games", "board-games", "coffee", "sci-fi-novels", "anime"],
    colors: [["#6366f1", "#8b5cf6"], ["#0ea5e9", "#6366f1"], ["#06b6d4", "#3b82f6"]],
    prompts: [["learning-now", "Rust, slowly, and a lot of coffee."], ["ideal-day", "Hack on a side project, then game night."], ["favorite-spot", "The engineering lounge after 8 pm."], ["random-fact", "I once debugged a bug in my sleep."]],
  },
  design: {
    majors: ["시각디자인전공", "산업디자인전공", "패션산업학과"],
    courses: [["DDS2020", "001"], ["DPS1010", "001"], ["DEN1001", "001"], ["DSO1010", "001"]],
    clubs: ["Lens & Light Photography", "Film Society Reel", "Acoustic Band Echo", "Dance Crew"],
    interests: ["photography", "painting", "cafe-hopping", "indie-music", "journaling", "plants"],
    colors: [["#f43f5e", "#f59e0b"], ["#ec4899", "#8b5cf6"], ["#f97316", "#ef4444"]],
    prompts: [["currently-into", "Risograph prints and thrifted frames."], ["weekend-plan", "Sketchbook, a new cafe, golden hour."], ["go-to-order", "Oat latte, extra foam."], ["favorite-spot", "The studio window seat."]],
  },
  biz: {
    majors: ["경영학과", "경제학과", "회계세무학과"],
    courses: [["DBA1001", "001"], ["DEC1001", "001"], ["DMK2010", "001"], ["DEN1001", "001"], ["DMA1010", "001"]],
    clubs: ["Hoop Dreams Basketball", "Debate Society", "Startup Study Group", "Cooking Club"],
    interests: ["basketball", "travel-planning", "coffee", "running", "cooking", "backpacking"],
    colors: [["#f59e0b", "#ef4444"], ["#10b981", "#0ea5e9"], ["#84cc16", "#22c55e"]],
    prompts: [["weekend-plan", "Pickup basketball, then brunch."], ["go-to-order", "Cold brew, black."], ["ideal-day", "A morning run and a long lunch with friends."], ["overshare", "I plan trips I never take."]],
  },
  psych: {
    majors: ["심리학과", "사회복지학과", "미디어커뮤니케이션학과"],
    courses: [["DPS1010", "001"], ["DSO1010", "001"], ["DEN1001", "001"], ["DBA1001", "001"]],
    clubs: ["Volunteer Corps", "Debate Society", "Trail Hikers", "Film Society Reel"],
    interests: ["volunteering", "journaling", "plants", "korean-drama", "hiking", "language-exchange"],
    colors: [["#10b981", "#14b8a6"], ["#22c55e", "#0d9488"], ["#14b8a6", "#6366f1"]],
    prompts: [["favorite-spot", "A bench by the pond when it is quiet."], ["currently-into", "Podcasts about how people change."], ["weekend-plan", "Volunteer shift, then a long walk."], ["learning-now", "How to listen better."]],
  },
  sport: {
    majors: ["기계공학과", "생명과학과", "식품영양학과"],
    courses: [["DPH1010", "001"], ["DMA1010", "001"], ["DEN1001", "001"], ["DCS2010", "002"]],
    clubs: ["Hoop Dreams Basketball", "Trail Hikers", "Dance Crew", "Cooking Club"],
    interests: ["hiking", "running", "basketball", "cooking", "board-sports", "baking"],
    colors: [["#0ea5e9", "#22c55e"], ["#3b82f6", "#06b6d4"], ["#f97316", "#facc15"]],
    prompts: [["weekend-plan", "A trail I have not hiked yet."], ["ideal-day", "Sunrise run, then pancakes."], ["go-to-order", "Matcha latte."], ["random-fact", "I have finished two half marathons."]],
  },
};
/** [key, name, gender, birthYear, year, archetype, intents]; the rest is generated from the archetype with a seeded RNG. */
const FILLER_SPEC: [string, string, Gender, number, number, keyof typeof ARCHETYPES, IntentMode[]][] = [
  ["mia", "Mia", Gender.WOMAN, 2004, 3, "design", [IntentMode.FRIENDS]],
  ["lucas", "Lucas", Gender.MAN, 2005, 2, "cs", [IntentMode.FRIENDS, IntentMode.STUDY]],
  ["chloe", "Chloe", Gender.WOMAN, 2005, 2, "psych", [IntentMode.FRIENDS]],
  ["henry", "Henry", Gender.MAN, 2003, 4, "biz", [IntentMode.STUDY]],
  ["ava", "Ava", Gender.WOMAN, 2005, 3, "cs", [IntentMode.FRIENDS, IntentMode.STUDY]],
  ["oliver", "Oliver", Gender.MAN, 2004, 3, "sport", [IntentMode.FRIENDS]],
  ["lily", "Lily", Gender.WOMAN, 2006, 1, "design", [IntentMode.FRIENDS]],
  ["mason", "Mason", Gender.MAN, 2005, 2, "cs", [IntentMode.STUDY]],
  ["zoe", "Zoe", Gender.WOMAN, 2004, 3, "biz", [IntentMode.FRIENDS, IntentMode.STUDY]],
  ["ryan", "Ryan", Gender.MAN, 2006, 1, "psych", [IntentMode.FRIENDS]],
  ["nora", "Nora", Gender.WOMAN, 2003, 4, "cs", [IntentMode.STUDY]],
  ["leo", "Leo", Gender.MAN, 2005, 2, "design", [IntentMode.FRIENDS]],
  ["ella", "Ella", Gender.WOMAN, 2005, 3, "sport", [IntentMode.FRIENDS, IntentMode.STUDY]],
  ["owen", "Owen", Gender.MAN, 2004, 3, "biz", [IntentMode.FRIENDS]],
];
const FILLERS: Persona[] = FILLER_SPEC.map(([key, firstName, gender, birthYear, year, arch, intents]) => {
  const r = rng(key);
  const a = ARCHETYPES[arch];
  const freeBlocks: number[] = [];
  for (const day of pick(r, [0, 1, 2, 3, 4], 3 + Math.floor(r() * 3))) for (const block of pick(r, [5, 6, 7, 8, 9], 1 + Math.floor(r() * 2))) freeBlocks.push(slot(day, block));
  return {
    key, firstName, gender, birthYear, year,
    major: pick(r, a.majors, 1)[0],
    intents,
    // one section per course (a person can't be in two sections of the same course)
    courses: pick(r, a.courses, 3 + Math.floor(r() * 2)).filter((c, i, all) => all.findIndex((x) => x[0] === c[0]) === i).slice(0, 3),
    clubs: pick(r, a.clubs, 1 + Math.floor(r() * 2)),
    interests: pick(r, a.interests, 3 + Math.floor(r() * 3)),
    freeTime: freeBlocks.sort((x, y) => x - y),
    values: Array.from({ length: 8 }, () => 1 + Math.floor(r() * 5)),
    prompts: pick(r, a.prompts, 3),
    colors: pick(r, a.colors, 1)[0],
  };
});
const ALL_PERSONAS: Persona[] = [...PERSONAS, ...FILLERS];

/** Three abstract avatars per person: a monogram, the overlap motif, and a landscape. Never a face. */
function avatarSvg(variant: number, initial: string, [a, b]: [string, string]): string {
  const defs = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>`;
  const tag = `<text x="36" y="1164" font-size="34" font-family="Arial,sans-serif" font-weight="700" fill="white" fill-opacity="0.75" letter-spacing="4">DEMO</text>`;
  if (variant === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="1200" viewBox="0 0 1600 1200">${defs}<rect width="1600" height="1200" fill="url(#g)"/><circle cx="1250" cy="260" r="360" fill="white" fill-opacity="0.08"/><circle cx="300" cy="1040" r="300" fill="white" fill-opacity="0.08"/><text x="800" y="800" font-size="620" font-family="Arial,sans-serif" font-weight="700" text-anchor="middle" fill="white" fill-opacity="0.9">${initial}</text>${tag}</svg>`;
  }
  if (variant === 1) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">${defs}<rect width="1200" height="1200" fill="${b}"/><circle cx="470" cy="600" r="330" fill="${a}"/><circle cx="730" cy="600" r="330" fill="white" fill-opacity="0.55"/><circle cx="600" cy="600" r="64" fill="white" fill-opacity="0.85"/><circle cx="170" cy="190" r="30" fill="white" fill-opacity="0.6"/><circle cx="1040" cy="1010" r="44" fill="white" fill-opacity="0.5"/>${tag}</svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200">${defs}<rect width="1200" height="1200" fill="url(#g)"/><circle cx="850" cy="380" r="150" fill="white" fill-opacity="0.85"/><path d="M0 860 L260 560 L470 800 L700 520 L1000 840 L1200 700 L1200 1200 L0 1200 Z" fill="${b}" fill-opacity="0.85"/><path d="M0 1000 L300 780 L560 1000 L880 760 L1200 980 L1200 1200 L0 1200 Z" fill="${a}" fill-opacity="0.9"/>${tag}</svg>`;
}

async function main() {
  const envFile = process.env.DEMO_ENV_FILE;
  loadEnv({ path: envFile ?? ".env.local", override: Boolean(envFile) });
  const url = process.env.DATABASE_URL ?? "";
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  const isLocal = host === "localhost" || host === "127.0.0.1";
  if (!isLocal && !(process.argv.includes("--production-demo") && process.env.DEMO_PRODUCTION_OK === DOMAIN)) {
    console.error(`Refusing to seed demo accounts: DATABASE_URL points at "${host || "(unset)"}", not this computer. Pass --production-demo and set DEMO_PRODUCTION_OK=${DOMAIN} only for the separate demo campus.`);
    process.exit(1);
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const domain = await prisma.emailDomain.findUnique({ where: { domain: DOMAIN }, include: { campus: true } });
    if (domain && domain.campus.name !== "Hartwell University") throw new Error(`${DOMAIN} is not the Hartwell demo campus.`);
    if (!domain) throw new Error(`No campus for ${DOMAIN}. Run db:create-campus and the reference imports first.`);
    const campusId = domain.campusId;

    const courses = await prisma.course.findMany({ where: { campusId }, include: { sections: true } });
    const clubs = await prisma.club.findMany({ where: { campusId } });
    const tags = await prisma.interestTag.findMany();
    const prompts = await prisma.prompt.findMany();
    const now = new Date();

    // DEMO_SKIP_OPERATOR=1: no fake ADMIN account (production demo: admin pages are not campus-scoped, so a demo admin would see real testers' reports).
    const people = ALL_PERSONAS.filter((p) => !(process.env.DEMO_SKIP_OPERATOR === "1" && p.role === Role.ADMIN));
    for (const [personaIndex, p] of people.entries()) {
      const email = emailFor(p.key);
      if (await prisma.user.findUnique({ where: { email } })) {
        console.log(`  ${p.firstName}: already exists, skipped`);
        continue;
      }

      const courseRows = p.courses.map(([code, section]) => {
        const course = courses.find((c) => c.code === code);
        if (!course) throw new Error(`Unknown course ${code}`);
        const sec = course.sections.find((s) => s.section === section);
        if (!sec) throw new Error(`Unknown section ${code}-${section}`);
        return { courseId: course.id, sectionId: sec.id };
      });
      const clubIds = p.clubs.map((name) => {
        const club = clubs.find((c) => c.nameEn === name);
        if (!club) throw new Error(`Unknown club ${name}`);
        return club.id;
      });
      const tagIds = p.interests.map((slug) => {
        const tag = tags.find((t) => t.slug === slug);
        if (!tag) throw new Error(`Unknown interest ${slug}`);
        return tag.id;
      });
      const promptRows = p.prompts.map(([key, answer], i) => {
        const prompt = prompts.find((x) => x.key === key);
        if (!prompt) throw new Error(`Unknown prompt ${key}`);
        return { promptId: prompt.id, answer, sortOrder: i };
      });

      const user = await prisma.user.create({
        data: {
          name: p.firstName,
          email,
          emailVerified: true,
          campusId,
          birthYear: p.birthYear,
          ageVerifiedAt: now,
          verifiedAt: now,
          isSynthetic: true,
          role: p.role ?? Role.USER,
          profile: {
            create: {
              firstName: p.firstName,
              gender: p.gender,
              year: p.year,
              major: p.major,
              intents: p.intents,
              freeTimeSlots: p.freeTime,
              valuesAnswers: p.values,
              onboardingStep: 10,
              completedAt: now,
              incognito: p.hidden ?? false,
              courses: { create: courseRows },
              clubs: { create: clubIds.map((clubId) => ({ clubId })) },
              interests: { create: tagIds.map((interestTagId) => ({ interestTagId })) },
              promptAnswers: { create: promptRows },
            },
          },
        },
        include: { profile: true },
      });

      // Consent ledger rows, as a real onboarding writes them.
      for (const [type, granted] of [
        [ConsentType.TERMS, true],
        [ConsentType.PRIVACY_POLICY, true],
        [ConsentType.SENSITIVE_PREFERENCE, false],
      ] as const) {
        await prisma.consent.create({ data: { userId: user.id, type, granted, policyVersion: "demo", source: "seed-demo" } });
      }

      // Photos go through the app's own pipeline (re-encode, strip metadata, store).
      for (let i = 0; i < 3; i++) {
        const svg = avatarSvg(i, p.firstName[0].toUpperCase(), p.colors);
        const jpeg = await sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
        const processed = await processPhoto(jpeg);
        const storageKey = newPhotoStorageKey(user.id);
        await uploadPhoto(storageKey, processed.bytes);
        await prisma.photo.create({
          data: { profileId: user.profile!.id, storageKey, sortOrder: i, width: processed.width, height: processed.height },
        });
      }
      console.log(`  ${p.firstName} (${email}) created${p.role ? ` as ${p.role}` : ""}`);
      void personaIndex;
    }
    console.log("Demo campus ready.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
