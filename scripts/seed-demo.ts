import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadEnv } from "dotenv";
import sharp from "sharp";
import { ConsentType, Gender, IntentMode, Role } from "../src/generated/prisma/enums";
import { PrismaClient } from "../src/generated/prisma/client";
import { newPhotoStorageKey, processPhoto, uploadPhoto } from "../src/server/storage/photos";

/**
 * Builds the demonstration campus: nine fictional students plus one operator account on
 * "Demo University" (demo.ac.kr), with hand-designed overlaps so the matching algorithm has
 * something clear to show. Everything is invented: names, majors, interests, free time,
 * and the generated avatars (abstract shapes with a small "DEMO" tag, never a face).
 *
 * Run after `db:create-campus --name "Demo University" --domain demo.ac.kr` and the
 * reference imports (see docs/demo-runbook.md).
 *
 * Usage: tsx scripts/seed-demo.ts
 *
 * Refuses to run against any database that is not on this computer: demo accounts must never
 * reach production (CLAUDE.md: synthetic users exist only in dev and staging, and
 * `db:check-readiness` fails if any are found there).
 */

const DOMAIN = "demo.ac.kr";

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
    key: "mina", firstName: "Mina", gender: Gender.WOMAN, birthYear: 2005, year: 3, major: "컴퓨터공학과",
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
    key: "jun", firstName: "Jun", gender: Gender.MAN, birthYear: 2005, year: 3, major: "컴퓨터공학과",
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
    key: "soyeon", firstName: "Soyeon", gender: Gender.WOMAN, birthYear: 2004, year: 4, major: "시각디자인전공",
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
    key: "yuna", firstName: "Yuna", gender: Gender.WOMAN, birthYear: 2005, year: 3, major: "심리학과",
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
    key: "haru", firstName: "Haru", gender: Gender.MAN, birthYear: 2004, year: 3, major: "컴퓨터공학과 (영어 트랙)",
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
    key: "minseok", firstName: "Minseok", gender: Gender.MAN, birthYear: 2005, year: 2, major: "경제학과",
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
    key: "eunji", firstName: "Eunji", gender: Gender.WOMAN, birthYear: 2004, year: 3, major: "산업디자인전공",
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
    key: "taeyang", firstName: "Taeyang", gender: Gender.MAN, birthYear: 2003, year: 4, major: "법학과",
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
  loadEnv({ path: ".env.local" });
  const url = process.env.DATABASE_URL ?? "";
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  if (host !== "localhost" && host !== "127.0.0.1") {
    console.error(`Refusing to seed demo accounts: DATABASE_URL points at "${host || "(unset)"}", not this computer.`);
    process.exit(1);
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const domain = await prisma.emailDomain.findUnique({ where: { domain: DOMAIN } });
    if (!domain) throw new Error(`No campus for ${DOMAIN}. Run db:create-campus and the reference imports first.`);
    const campusId = domain.campusId;

    const courses = await prisma.course.findMany({ where: { campusId }, include: { sections: true } });
    const clubs = await prisma.club.findMany({ where: { campusId } });
    const tags = await prisma.interestTag.findMany();
    const prompts = await prisma.prompt.findMany();
    const now = new Date();

    for (const [personaIndex, p] of PERSONAS.entries()) {
      const email = `${p.key}@${DOMAIN}`;
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
