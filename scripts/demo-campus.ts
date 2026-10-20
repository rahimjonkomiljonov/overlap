import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadEnv } from "dotenv";
import { PrismaClient } from "../src/generated/prisma/client";
import { deletePhoto } from "../src/server/storage/photos";

/**
 * Manages the fictional "Hartwell University" demo campus (docs/demo-runbook.md).
 *
 *   tsx scripts/demo-campus.ts create [--alias-domain gmail.com] [--production-demo]
 *   tsx scripts/demo-campus.ts status
 *   tsx scripts/demo-campus.ts remove [--production-demo]
 *
 * The demo campus is its own campus, so matching pools (which are per campus) never mix
 * its fictional people with real students. `--alias-domain` also maps one extra email
 * domain (the owner's own mail provider) to the campus so demo logins can use plus-address
 * aliases of a real inbox; `remove` deletes that mapping again along with every synthetic
 * user, photo, cohort and invite code of the campus.
 *
 * Against a non-local database it needs `--production-demo` AND DEMO_PRODUCTION_OK=hartwell.edu.
 */

const CAMPUS_NAME = "Hartwell University";
const DOMAIN = "hartwell.edu";

function isLocal(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === "localhost" || host === "127.0.0.1";
  } catch {
    return false;
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  const envFile = process.env.DEMO_ENV_FILE;
  loadEnv({ path: envFile ?? ".env.local", override: Boolean(envFile) });
  const url = process.env.DATABASE_URL ?? "";
  if (!isLocal(url) && !(args.includes("--production-demo") && process.env.DEMO_PRODUCTION_OK === DOMAIN)) {
    console.error("Refusing: this database is not on this computer. Pass --production-demo and set DEMO_PRODUCTION_OK=hartwell.edu if that is intended.");
    process.exit(1);
  }
  const alias = (() => {
    const i = args.indexOf("--alias-domain");
    return i === -1 ? undefined : args[i + 1]?.toLowerCase();
  })();

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const existing = await prisma.emailDomain.findUnique({ where: { domain: DOMAIN }, include: { campus: true } });

    if (command === "create") {
      let campusId = existing?.campusId;
      if (existing && existing.campus.name !== CAMPUS_NAME) throw new Error(`${DOMAIN} belongs to "${existing.campus.name}", not the demo campus.`);
      if (!campusId) {
        const campus = await prisma.campus.create({ data: { name: CAMPUS_NAME } });
        campusId = campus.id;
        await prisma.emailDomain.create({ data: { campusId, domain: DOMAIN } });
        console.log(`Created campus "${CAMPUS_NAME}" (${campusId}).`);
      }
      if (alias) {
        const taken = await prisma.emailDomain.findUnique({ where: { domain: alias } });
        if (taken && taken.campusId !== campusId) throw new Error(`Alias domain ${alias} already belongs to another campus; refusing.`);
        if (!taken) await prisma.emailDomain.create({ data: { campusId, domain: alias } });
        console.log(`Alias domain ${alias} maps to the demo campus.`);
      }
      const cohort = await prisma.cohort.upsert({ where: { campusId_name: { campusId, name: "Hartwell Demo" } }, update: {}, create: { campusId, name: "Hartwell Demo" } });
      const code = "HARTWELL-DEMO";
      await prisma.inviteCode.upsert({ where: { code }, update: {}, create: { cohortId: cohort.id, code, maxUses: 5 } });
      console.log(`Invite code ${code} (5 uses) for the demo campus.`);
      return;
    }

    if (!existing || existing.campus.name !== CAMPUS_NAME) {
      console.log("No demo campus here.");
      return;
    }
    const campusId = existing.campusId;

    if (command === "status") {
      const users = await prisma.user.groupBy({ by: ["isSynthetic"], where: { campusId }, _count: true });
      const domains = await prisma.emailDomain.findMany({ where: { campusId }, select: { domain: true } });
      console.log("domains:", domains.map((d) => d.domain).join(", "), "| users:", JSON.stringify(users));
      return;
    }

    if (command === "remove") {
      // Demo people: flagged synthetic, or a sign-up made during the demo with a @hartwell.edu or the owner's plus-alias address (Dana, who joins live).
      const ownerLocal = process.env.DEMO_OWNER_EMAIL?.trim().toLowerCase().split("@")[0];
      const isDemo = { OR: [{ isSynthetic: true }, { email: { endsWith: "@hartwell.edu" } }, ...(ownerLocal ? [{ email: { startsWith: ownerLocal + "+" } }] : [])] };
      const real = await prisma.user.count({ where: { campusId, NOT: isDemo } });
      if (real > 0) throw new Error(`${real} user(s) in the demo campus do not look like demo accounts. Remove or move them first; nothing was deleted.`);
      const photos = await prisma.photo.findMany({ where: { profile: { user: { campusId } } }, select: { storageKey: true } });
      for (const p of photos) await deletePhoto(p.storageKey).catch(() => undefined);
      // Some tables reference users without ON DELETE CASCADE (consents, audit rows, ...): clear those rows for these users first.
      const ids = (await prisma.user.findMany({ where: { campusId, ...isDemo }, select: { id: true } })).map((u) => u.id);
      const blockers = await prisma.$queryRawUnsafe<{ tbl: string; col: string }[]>(
        `select c.conrelid::regclass::text as tbl, a.attname as col from pg_constraint c join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
         where c.contype = 'f' and c.confrelid = 'users'::regclass and c.confdeltype in ('a', 'r')`,
      );
      for (let pass = 0; pass < 4; pass++) {
        for (const b of blockers) {
          await prisma.$executeRawUnsafe(`delete from ${b.tbl} where "${b.col}" = any($1::text[])`, ids).catch(() => undefined);
        }
      }
      const users = await prisma.user.deleteMany({ where: { campusId, ...isDemo } });
      await prisma.inviteCode.deleteMany({ where: { cohort: { campusId } } });
      await prisma.cohort.deleteMany({ where: { campusId } });
      // Waitlist rows reference the campus without ON DELETE CASCADE, so without this the campus delete below fails after the users
      // are already gone (a half-removed demo). Anyone who joined the waitlist through the alias domain is cleared with it.
      const waitlist = await prisma.waitlist.deleteMany({ where: { campusId } });
      await prisma.campus.delete({ where: { id: campusId } }); // email domains, courses, clubs, spots, IDF stats cascade
      console.log(`Removed demo campus: ${users.count} users, ${photos.length} photos, ${waitlist.count} waitlist sign-ups.`);
      return;
    }
    console.error("Usage: demo-campus.ts create|status|remove");
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
