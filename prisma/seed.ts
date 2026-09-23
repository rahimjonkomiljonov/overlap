import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/**
 * Dev/CI reference data only — never run against a real production database. The real
 * campus (name, domains, timezone) comes from owner tasks O4/O10 and lands properly in
 * S06's bulk import; this just gives S04 onward something to test the waitlist against.
 */
async function main() {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed dev data: NODE_ENV is production.");
  }

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const campus = await prisma.campus.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Dev Campus (placeholder — real campus pending O4/O10)",
      timeZone: "Asia/Seoul",
    },
  });

  await prisma.emailDomain.upsert({
    where: { domain: "test.ac.kr" },
    update: { campusId: campus.id },
    create: { domain: "test.ac.kr", campusId: campus.id },
  });

  console.log(`Seeded dev campus "${campus.name}" with domain test.ac.kr`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
